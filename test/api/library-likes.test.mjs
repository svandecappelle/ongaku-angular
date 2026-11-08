import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api, uidOf } from '../helpers/client.mjs';

test('likes: add, list (recent first), remove; a second like keeps the first date', async (t) => {
  const one = await uidOf('Moon Safari 1');
  const two = await uidOf('Moon Safari 2');
  t.after(() => api('/api/likes/remove', { as: 'carol', json: { elements: [one, two] } }));

  assert.equal((await api('/api/likes/add', { as: 'carol', json: { elements: [one, 'nope'] } })).body.added, 1);
  const first = (await api('/api/likes', { as: 'carol' })).body.tracks.find((tr) => tr.uid === one).likedAt;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await api('/api/likes/add', { as: 'carol', json: { elements: [two, one] } });

  const liked = (await api('/api/likes', { as: 'carol' })).body.tracks;
  assert.deepEqual(liked.map((tr) => tr.uid), [two, one], 'most recent first');
  assert.equal(liked.find((tr) => tr.uid === one).likedAt, first, 'liked again: same date');
  assert.ok((await api('/api/likes/uids', { as: 'carol' })).body.includes(one));
  assert.equal((await api('/api/user/me', { as: 'carol' })).body.likes, 2);

  await api('/api/likes/remove', { as: 'carol', json: { elements: [one] } });
  assert.deepEqual((await api('/api/likes', { as: 'carol' })).body.tracks.map((tr) => tr.uid), [two]);
});

test('likes are per user and need a session', async (t) => {
  const one = await uidOf('Moon Safari 1');
  t.after(() => api('/api/likes/remove', { as: 'carol', json: { elements: [one] } }));
  await api('/api/likes/add', { as: 'carol', json: { elements: [one] } });
  assert.ok(!(await api('/api/likes/uids', { as: 'alice' })).body.includes(one));
  assert.equal((await api('/api/likes')).status, 401);
  assert.equal((await api('/api/likes/add', { as: 'carol', json: { elements: 'x' } })).status, 400);
});

test('my library: add and remove tracks', async (t) => {
  const uid = await uidOf('OK Computer 4');
  t.after(() => api('/api/user/library/remove', { as: 'carol', json: { elements: [uid] } }));
  await api('/api/user/library/add', { as: 'carol', json: { elements: [uid] } });
  assert.ok((await api('/api/user/library/uids', { as: 'carol' })).body.includes(uid));
  const content = (await api('/api/user/library/content', { as: 'carol' })).body;
  assert.ok(content.albums.some((album) => album.title === 'OK Computer' && album.tracks.some((tr) => tr.uid === uid)));

  await api('/api/user/library/remove', { as: 'carol', json: { elements: [uid] } });
  assert.ok(!(await api('/api/user/library/uids', { as: 'carol' })).body.includes(uid));
  assert.equal((await api('/api/user/library/add', { as: 'carol', json: { elements: 'x' } })).status, 400);
});
