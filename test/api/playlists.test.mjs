import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api, uidOf } from '../helpers/client.mjs';

const url = (name) => `/api/playlist/${encodeURIComponent(name)}`;

async function okComputer() {
  return Promise.all(['OK Computer 1', 'OK Computer 2', 'OK Computer 3'].map((title) => uidOf(title)));
}

test('playlists need a session', async () => {
  assert.equal((await api('/api/playlist')).status, 401);
});

test('create, read, list and delete a playlist', async () => {
  const uids = await okComputer();
  const created = await api('/api/playlist', { as: 'alice', json: { name: '  Road trip  ', uids } });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Road trip', 'name trimmed');
  assert.deepEqual(created.body.tracks.map((t) => t.title), ['OK Computer 1', 'OK Computer 2', 'OK Computer 3']);
  assert.equal(created.body.count, 3);

  const list = await api('/api/playlist', { as: 'alice' });
  assert.ok(list.body.some((p) => p.name === 'Road trip' && p.count === 3));

  assert.equal((await api(url('Road trip'), { as: 'alice', method: 'DELETE' })).status, 200);
  assert.equal((await api(url('Road trip'), { as: 'alice' })).status, 404);
});

test('names: blank refused, duplicates refused', async (t) => {
  t.after(() => api(url('Dup'), { as: 'alice', method: 'DELETE' }));
  assert.equal((await api('/api/playlist', { as: 'alice', json: { name: '   ' } })).status, 400);
  assert.equal((await api('/api/playlist', { as: 'alice', json: { name: 'x'.repeat(101) } })).status, 400);
  assert.equal((await api('/api/playlist', { as: 'alice', json: { name: 'Dup' } })).status, 201);
  assert.equal((await api('/api/playlist', { as: 'alice', json: { name: 'Dup' } })).status, 409);
});

test('a track is in a playlist once; unknown tracks are left out', async (t) => {
  t.after(() => api(url('Once'), { as: 'alice', method: 'DELETE' }));
  const [one, two] = await okComputer();
  const created = await api('/api/playlist', { as: 'alice', json: { name: 'Once', uids: [one, one, 'nope', two] } });
  assert.deepEqual(created.body.tracks.map((t) => t.uid), [one, two]);

  const appended = await api(`${url('Once')}/tracks`, { as: 'alice', json: { uids: [one, 'nope'] } });
  assert.equal(appended.body.added, 0, 'already in the playlist');
  assert.equal(appended.body.count, 2);
});

test('rename (names with a slash too), reorder and remove tracks', async (t) => {
  t.after(() => api(url('Summer / 2026'), { as: 'alice', method: 'DELETE' }));
  const [one, two, three] = await okComputer();
  await api('/api/playlist', { as: 'alice', json: { name: 'Focus/Night', uids: [one, two, three] } });

  const renamed = await api(url('Focus/Night'), { as: 'alice', method: 'PUT', json: { name: 'Summer / 2026' } });
  assert.equal(renamed.status, 200);
  assert.equal((await api(url('Focus/Night'), { as: 'alice' })).status, 404);

  const reordered = await api(url('Summer / 2026'), { as: 'alice', method: 'PUT', json: { uids: [three, one] } });
  assert.deepEqual(reordered.body.tracks.map((t) => t.uid), [three, one]);
  assert.deepEqual((await api(url('Summer / 2026'), { as: 'alice' })).body.tracks.map((t) => t.uid), [three, one]);
});

test('renaming to a used name is refused', async (t) => {
  t.after(async () => {
    await api(url('First'), { as: 'alice', method: 'DELETE' });
    await api(url('Second'), { as: 'alice', method: 'DELETE' });
  });
  await api('/api/playlist', { as: 'alice', json: { name: 'First' } });
  await api('/api/playlist', { as: 'alice', json: { name: 'Second' } });
  assert.equal((await api(url('First'), { as: 'alice', method: 'PUT', json: { name: 'Second' } })).status, 409);
});

test('the playlists of a user are his own', async (t) => {
  t.after(() => api(url('Private mix'), { as: 'alice', method: 'DELETE' }));
  await api('/api/playlist', { as: 'alice', json: { name: 'Private mix' } });
  assert.ok(!(await api('/api/playlist', { as: 'carol' })).body.some((p) => p.name === 'Private mix'));
  assert.equal((await api(url('Private mix'), { as: 'carol' })).status, 404);
  assert.equal((await api(url('Private mix'), { as: 'carol', method: 'DELETE' })).status, 404);
  assert.equal((await api(url('Private mix'), { as: 'alice' })).status, 200, 'still there for its owner');
});

test('the profile counts the playlists', async (t) => {
  t.after(() => api(url('Counted'), { as: 'carol', method: 'DELETE' }));
  const before = (await api('/api/user/me', { as: 'carol' })).body.playlists;
  await api('/api/playlist', { as: 'carol', json: { name: 'Counted' } });
  assert.equal((await api('/api/user/me', { as: 'carol' })).body.playlists, before + 1);
});
