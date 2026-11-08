import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MUSIC, api, eventually, fileForm, track, uidOf } from '../helpers/client.mjs';

const remove = (as, uids) => api('/api/tracks/delete', { as, json: { uids } });

test('deleting needs a session and a list of uids', async () => {
  assert.equal((await api('/api/tracks/delete', { json: { uids: ['x'] } })).status, 401);
  assert.equal((await remove('alice', 'x')).status, 400);
});

test('a user cannot delete a track of the public library', async () => {
  const uid = await uidOf('Delete me user');
  const result = await remove('alice', [uid]);
  assert.deepEqual(result.body.deleted, []);
  assert.match(result.body.failed[0].message, /your own uploads/);
  assert.ok(fs.existsSync(path.join(MUSIC, 'Victim/Delete Me/2.mp3')));
});

test('a user deletes his own upload', async () => {
  await api('/api/user/files/upload', { as: 'alice', form: fileForm('small.mp3') });
  const upload = await eventually(() => track('Small upload', 'alice'), { what: 'the upload' });
  const result = await remove('alice', [upload.uid]);
  assert.deepEqual(result.body.deleted, [upload.uid]);
  assert.equal(await track('Small upload', 'alice'), undefined);
  assert.equal((await api('/api/user/files', { as: 'alice' })).body.files.some((f) => f.name === 'small.mp3'), false);
});

test('an administrator deletes a track: file, library and saved references gone', async () => {
  const uid = await uidOf('Delete me admin');
  await api('/api/likes/add', { as: 'carol', json: { elements: [uid] } });
  await api('/api/playlist', { as: 'carol', json: { name: 'With a victim', uids: [uid, await uidOf('Moon Safari 1')] } });

  const result = await remove('boss', [uid]);
  assert.deepEqual(result.body.deleted, [uid]);
  assert.ok(!fs.existsSync(path.join(MUSIC, 'Victim/Delete Me/1.mp3')));
  assert.equal(await track('Delete me admin'), undefined);
  assert.ok(!(await api('/api/likes/uids', { as: 'carol' })).body.includes(uid), 'likes purged');
  const playlist = (await api('/api/playlist/With%20a%20victim', { as: 'carol' })).body;
  assert.deepEqual([playlist.count, playlist.missing], [1, 0], 'playlist purged, nothing missing');
  await api('/api/playlist/With%20a%20victim', { as: 'carol', method: 'DELETE' });
});

test('a read-only file is reported, not deleted', { skip: process.getuid?.() === 0 && 'root ignores file permissions' }, async (t) => {
  const folder = path.join(MUSIC, 'Victim/Delete Me');
  t.after(() => fs.chmodSync(folder, 0o755));
  fs.chmodSync(folder, 0o555);
  const uid = await uidOf('Delete me queued');
  const result = await remove('boss', [uid]);
  assert.deepEqual(result.body.deleted, []);
  assert.match(result.body.failed[0].message, /read-only/);
  assert.ok(await track('Delete me queued'), 'still in the library');
});

test('an unknown track is reported', async () => {
  const result = await remove('boss', ['nope']);
  assert.equal(result.body.failed[0].message, 'No such track');
});
