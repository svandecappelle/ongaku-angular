import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { APP, BASE, api, fileForm, login, track } from '../helpers/client.mjs';

async function videos(as = 'carol', query = '') {
  const { status, body } = await api(`/api/video${query ? `?q=${encodeURIComponent(query)}` : ''}`, { as });
  assert.equal(status, 200, JSON.stringify(body));
  return body.videos;
}

async function videoNamed(title) {
  const found = (await videos()).find((video) => video.title === title);
  assert.ok(found, `the video "${title}"`);
  return found;
}

test('the videos of the library are listed with their details, never their path', async () => {
  const list = await videos();
  const titles = list.map((video) => video.title);
  assert.deepEqual(titles, ['Old clip', 'Beach day', 'Mountain trip'], 'by folder, then title');

  const beach = list.find((video) => video.title === 'Beach day');
  assert.equal(beach.folder, 'Videos/Holidays');
  assert.equal(beach.name, 'beach_day.webm');
  assert.equal(beach.mime, 'video/webm');
  assert.equal(beach.width, 320);
  assert.equal(beach.height, 240);
  assert.ok(Math.abs(beach.duration - 6) < 0.6, `duration ${beach.duration}`);
  assert.equal(beach.playable, true);
  assert.equal(list.find((video) => video.title === 'Mountain trip').playable, true, 'the title from the file name');
  assert.equal(list.find((video) => video.title === 'Old clip').playable, false, 'MPEG-1: not for the browsers');
  assert.ok(list.every((video) => !('file' in video)), 'no path on the server');
  assert.ok(!JSON.stringify(list).includes(path.sep + 'Videos' + path.sep));
});

test('the videos are searched, and are not among the tracks', async () => {
  assert.deepEqual((await videos('carol', 'beach')).map((video) => video.title), ['Beach day']);
  assert.deepEqual((await videos('carol', 'holidays')).map((video) => video.title).sort(), ['Beach day', 'Mountain trip']);
  assert.deepEqual(await videos('carol', 'nothing like this'), []);

  assert.equal(await track('beach_day.webm'), undefined);
  assert.equal(await track('Beach day'), undefined);
  // The audio stream does not serve them
  const beach = await videoNamed('Beach day');
  assert.equal((await api(`/api/audio/stream/${beach.uid}`, { as: 'carol' })).status, 404);
});

test('a video is streamed by ranges, for seeking', async () => {
  const beach = await videoNamed('Beach day');
  const cookie = await login('carol');
  const whole = await fetch(`${BASE}/api/video/${beach.uid}/stream`, { headers: { Cookie: cookie } });
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'video/webm');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  const bytes = Buffer.from(await whole.arrayBuffer());
  assert.equal(bytes.length, beach.size);
  // The WebM signature (EBML)
  assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);

  const part = await fetch(`${BASE}/api/video/${beach.uid}/stream`, { headers: { Cookie: cookie, Range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 100-199/${beach.size}`);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(100, 200));

  const outside = await fetch(`${BASE}/api/video/${beach.uid}/stream`, { headers: { Cookie: cookie, Range: `bytes=${beach.size + 10}-` } });
  assert.equal(outside.status, 416);
});

test('the poster of a video is a frame, made once and kept outside the served files', async () => {
  const beach = await videoNamed('Beach day');
  const cookie = await login('carol');
  const first = await fetch(`${BASE}/api/video/${beach.uid}/poster`, { headers: { Cookie: cookie } });
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type'), /^image\/jpeg/);
  const image = Buffer.from(await first.arrayBuffer());
  assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff], 'a JPEG');

  const cache = path.join(APP, 'public/.cache/posters');
  const cached = fs.readdirSync(cache).filter((file) => file.startsWith(beach.uid));
  assert.equal(cached.length, 1);
  assert.equal((await fetch(`${BASE}/api/video/${beach.uid}/poster`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal(fs.readdirSync(cache).filter((file) => file.startsWith(beach.uid)).length, 1, 'not made again');
  const leaked = await fetch(`${BASE}/static/.cache/posters/${cached[0]}`, { headers: { Cookie: cookie } });
  assert.notEqual(leaked.headers.get('content-type'), 'image/jpeg');
});

test('the videos need a session and a known uid', async () => {
  const beach = await videoNamed('Beach day');
  for (const url of ['/api/video', `/api/video/${beach.uid}`, `/api/video/${beach.uid}/stream`, `/api/video/${beach.uid}/poster`]) {
    assert.equal((await api(url)).status, 401, url);
  }
  assert.equal((await api(`/api/video/${beach.uid}`, { as: 'carol' })).body.title, 'Beach day');
  for (const url of ['/api/video/unknown', '/api/video/unknown/stream', '/api/video/unknown/poster', '/api/video/..%2F..%2Fetc/stream']) {
    assert.equal((await api(url, { as: 'carol' })).status, 404, url);
  }
});

test('videos are uploaded, alone or in an archive, and only their owner sees them', async (t) => {
  const removeUploads = async () => {
    const { body } = await api('/api/user/files', { as: 'alice' });
    for (const file of body.files ?? []) {
      await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as: 'alice', method: 'DELETE' });
    }
  };
  t.after(removeUploads);

  const single = await api('/api/user/files/upload', { as: 'alice', form: fileForm('home movie.mpeg') });
  assert.equal(single.status, 200, JSON.stringify(single.body));
  assert.deepEqual(single.body.files, [{ file: 'home movie.mpeg', imported: ['home movie.mpeg'] }]);
  const archive = await api('/api/user/files/upload', { as: 'alice', form: fileForm('video.zip') });
  assert.deepEqual(archive.body.files, [{ file: 'video.zip', imported: ['Trips/lake.webm'] }]);

  const mine = await videos('alice');
  const movie = mine.find((video) => video.title === 'home movie');
  const lake = mine.find((video) => video.title === 'lake');
  assert.ok(movie && lake, JSON.stringify(mine.map((video) => video.title)));
  assert.equal(movie.folder, 'My uploads');
  assert.equal(lake.folder, 'My uploads/Trips');
  assert.equal(movie.private, true);
  assert.equal(movie.playable, false, 'MPEG-1: a download');
  assert.equal(lake.playable, true);
  assert.equal((await fetch(`${BASE}/api/video/${lake.uid}/stream`, { headers: { Cookie: await login('alice') } })).status, 200);

  // The listing of the uploads tells them apart
  const listing = await api('/api/user/files', { as: 'alice' });
  assert.equal(listing.body.files.find((file) => file.name === 'home movie.mpeg').video, true);

  // Nobody else sees them, nor gets them
  const others = await videos('carol');
  assert.ok(!others.some((video) => video.uid === movie.uid || video.uid === lake.uid));
  assert.equal((await api(`/api/video/${lake.uid}/stream`, { as: 'carol' })).status, 404);

  // Deleted: gone from the videos
  await api(`/api/user/files?path=${encodeURIComponent('home movie.mpeg')}`, { as: 'alice', method: 'DELETE' });
  assert.ok(!(await videos('alice')).some((video) => video.uid === movie.uid));
});
