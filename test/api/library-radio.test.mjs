import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api, uidOf } from '../helpers/client.mjs';

const genreOf = (track) => [].concat(track.metadatas?.genre ?? track.metadatas?.GENRE ?? []).join(';').toLowerCase();
const next = (kind, query = '') => api(`/api/radios/library/${kind}/tracks${query}`, { as: 'boss' });

test('the stations offered: the mix first, then artists and the genres of the library', async (t) => {
  const liked = await uidOf('Moon Safari 1');
  await api('/api/likes/add', { as: 'boss', json: { elements: [liked] } });
  t.after(() => api('/api/likes/remove', { as: 'boss', json: { elements: [liked] } }));

  const { status, body } = await api('/api/radios/library', { as: 'boss' });
  assert.equal(status, 200);
  const [mix, ...others] = body.stations;
  assert.deepEqual([mix.kind, mix.name], ['mix', 'Made for boss']);
  assert.match(mix.text, /1 liked track/);
  assert.ok(others.some((station) => station.kind === 'artist'), JSON.stringify(others));
  const genres = others.filter((station) => station.kind === 'genre').map((station) => station.name);
  assert.ok(genres.includes('Electronic') && genres.includes('Rock'), `genres: ${genres}`);
  assert.ok(!body.stations.some((station) => station.kind === 'rediscover'), 'not without old likes');
});

test('a genre station plays that genre, each track once, with a reason', async () => {
  const { status, body } = await next('genre', '?seed=Electronic');
  assert.equal(status, 200);
  assert.ok(body.tracks.length > 0 && body.tracks.length <= 10);
  assert.ok(body.tracks.every((track) => genreOf(track).includes('electronic')), body.tracks.map(genreOf).join(' | '));
  assert.equal(new Set(body.tracks.map((track) => track.uid)).size, body.tracks.length, 'no repeat');
  assert.ok(body.tracks.every((track) => typeof track.reason === 'string' && track.reason));

  // What the station already queued is not sent again
  const again = (await next('genre', `?seed=Electronic&exclude=${body.tracks.map((track) => track.uid).join(',')}`)).body.tracks;
  assert.ok(!again.some((track) => body.tracks.some((sent) => sent.uid === track.uid)));
});

test('an artist station starts from the artist, then artists close to it', async () => {
  const { body } = await next('artist', '?seed=Radiohead');
  const radiohead = body.tracks.filter((track) => track.artist === 'Radiohead');
  assert.ok(radiohead.length > 0);
  assert.ok(radiohead.every((track) => track.reason === 'same artist'));
  assert.ok(body.tracks.every((track) => track.artist === 'Radiohead' || genreOf(track).includes('rock')));
});

test('the mix plays from the whole library; the requests are checked', async () => {
  const { body } = await next('mix');
  assert.equal(body.tracks.length, 10);
  assert.equal(new Set(body.tracks.map((track) => track.uid)).size, 10);
  assert.equal((await next('nope')).status, 404);
  assert.equal((await next('artist')).status, 400, 'an artist station needs its artist');
  assert.equal((await api('/api/radios/library')).status, 401);
});
