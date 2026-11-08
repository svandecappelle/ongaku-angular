import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { BASE, api, eventually, login } from '../helpers/client.mjs';

/**
 * A small internet radio for the tests: an Icecast-like MP3 stream with ICY metadata every
 * 16 bytes of "audio" (A letters), a .pls playlist pointing to it, an HTML page and an HLS list.
 */
const METAINT = 16;
const TITLE = 'Test Band - Live Song';
let station;
let base;

function metadataBlock(text) {
  const data = Buffer.from(`StreamTitle='${text}';`);
  const blocks = Math.ceil(data.length / 16);
  const block = Buffer.alloc(1 + blocks * 16);
  block[0] = blocks;
  data.copy(block, 1);
  return block;
}

before(async () => {
  station = http.createServer((req, res) => {
    if (req.url === '/live.mp3') {
      const icy = req.headers['icy-metadata'] === '1';
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'icy-name': 'Test FM',
        'icy-genre': 'Jazz',
        'icy-br': '128',
        ...(icy ? { 'icy-metaint': String(METAINT) } : {}),
      });
      const send = () => res.write(Buffer.concat([Buffer.alloc(METAINT, 'A'), icy ? metadataBlock(TITLE) : Buffer.alloc(0)]));
      send();
      const timer = setInterval(send, 30);
      res.on('close', () => clearInterval(timer));
    } else if (req.url === '/list.pls') {
      res.writeHead(200, { 'Content-Type': 'audio/x-scpls' });
      res.end(`[playlist]\nNumberOfEntries=1\nFile1=${base}/live.mp3\n`);
    } else if (req.url === '/hls.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\nsegment0.ts\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Not a stream</body></html>');
    }
  });
  await new Promise((resolve) => station.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${station.address().port}`;
});

after(() => {
  station.closeAllConnections();
  station.close();
});

const add = (fields, as = 'boss') => api('/api/radios', { as, json: { name: 'Test FM', genre: 'Jazz', ...fields } });
const remove = (id) => api(`/api/radios/${id}`, { as: 'boss', method: 'DELETE' });

test('testing a stream reads its type, name, bitrate and title; a playlist leads to its stream', async () => {
  const { status, body } = await api('/api/radios/test', { as: 'boss', json: { url: `${base}/list.pls` } });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.url, `${base}/live.mp3`);
  assert.deepEqual([body.type, body.name, body.genre, body.bitrate, body.title], ['audio/mpeg', 'Test FM', 'Jazz', 128, TITLE]);
  // The test ends the connection to the station: the server goes on
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await api('/api/radios', { as: 'boss' })).status, 200, 'the server still answers');
});

test('what is not an audio stream is refused, with the reason', async () => {
  const test = async (url) => (await api('/api/radios/test', { as: 'boss', json: { url } })).body.message;
  assert.match(await test(`${base}/page`), /Not an audio stream/);
  assert.match(await test(`${base}/hls.m3u8`), /HLS/);
  assert.match(await test('http://127.0.0.1:1/none'), /cannot be reached/);
  assert.equal((await api('/api/radios/test', { as: 'boss', json: { url: 'ftp://example.org/a' } })).status, 400);
  assert.equal((await add({ url: `${base}/page` })).status, 400);
});

test('only administrators add, change and delete stations; members do not see the address', async (t) => {
  assert.equal((await add({ url: `${base}/live.mp3` }, 'carol')).status, 403);
  assert.equal((await api('/api/radios/test', { as: 'carol', json: { url: `${base}/live.mp3` } })).status, 403);
  assert.equal((await add({ name: '', url: `${base}/live.mp3` })).status, 400);

  const created = await add({ url: `${base}/list.pls` });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.id;
  t.after(() => remove(id));
  assert.equal(created.body.url, `${base}/live.mp3`, 'the stream of the playlist is kept');

  const seen = (await api('/api/radios', { as: 'carol' })).body;
  const mine = seen.stations.find((s) => s.id === id);
  assert.equal(seen.administrator, false);
  assert.deepEqual([mine.name, mine.genre, mine.type, mine.bitrate, mine.url], ['Test FM', 'Jazz', 'audio/mpeg', 128, undefined]);
  assert.equal((await api('/api/radios', { as: 'boss' })).body.stations.find((s) => s.id === id).url, `${base}/live.mp3`);

  assert.equal((await api(`/api/radios/${id}`, { as: 'carol', method: 'DELETE' })).status, 403);
  const renamed = await api(`/api/radios/${id}`, { as: 'boss', method: 'PUT', json: { name: 'Renamed FM', url: `${base}/live.mp3` } });
  assert.equal(renamed.body.name, 'Renamed FM');
  assert.equal((await api('/api/radios')).status, 401);
});

test('the stream plays through the server, without its metadata; its title is on air', async (t) => {
  const id = (await add({ url: `${base}/live.mp3` })).body.id;
  t.after(() => remove(id));

  const controller = new AbortController();
  const response = await fetch(`${BASE}/api/radios/${id}/stream`, { headers: { Cookie: await login('carol') }, signal: controller.signal });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  const reader = response.body.getReader();
  let received = Buffer.alloc(0);
  while (received.length < METAINT * 6) {
    received = Buffer.concat([received, Buffer.from((await reader.read()).value)]);
  }
  controller.abort();
  assert.equal(received.toString('latin1'), 'A'.repeat(received.length), 'only the audio, metadata removed');

  await eventually(async () => (await api(`/api/radios/${id}/now`, { as: 'carol' })).body.title === TITLE, { what: 'the title on air' });
  assert.equal((await api('/api/radios', { as: 'carol' })).body.stations.find((s) => s.id === id).nowPlaying, TITLE);
});

test('favourites are per user; a deleted station stops', async () => {
  const id = (await add({ url: `${base}/live.mp3` })).body.id;
  assert.equal((await api(`/api/radios/${id}/favourite`, { as: 'carol', method: 'PUT', json: { favourite: true } })).status, 200);
  const favourite = async (as) => (await api('/api/radios', { as })).body.stations.find((s) => s.id === id)?.favourite;
  assert.equal(await favourite('carol'), true);
  assert.equal(await favourite('alice'), false);
  assert.equal((await api(`/api/radios/${id}/favourite`, { as: 'carol', method: 'PUT', json: { favourite: 'yes' } })).status, 400);
  await api(`/api/radios/${id}/favourite`, { as: 'carol', method: 'PUT', json: { favourite: false } });
  assert.equal(await favourite('carol'), false);

  assert.equal((await remove(id)).status, 200);
  assert.equal((await api(`/api/radios/${id}/stream`, { as: 'carol' })).status, 404);
  assert.equal((await api(`/api/radios/${id}/favourite`, { as: 'carol', method: 'PUT', json: { favourite: true } })).status, 404);
});
