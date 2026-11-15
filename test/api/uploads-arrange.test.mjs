import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { APP, api, eventually, fileForm, track } from '../helpers/client.mjs';

const ROOT = path.join(APP, 'public/user/alice/imported');
const upload = (file, folder = '') => api(`/api/user/files/upload${folder ? `?path=${encodeURIComponent(folder)}` : ''}`, { as: 'alice', form: fileForm(file) });
const folder = (name, inside = '') => api(`/api/user/files/folder${inside ? `?path=${encodeURIComponent(inside)}` : ''}`, { as: 'alice', json: { name } });
const move = (paths, to) => api('/api/user/files/move', { as: 'alice', json: { paths, to } });
const rename = (from, name) => api('/api/user/files/rename', { as: 'alice', json: { path: from, name } });
const removeAll = async () => {
  for (const share of (await api('/api/shares', { as: 'alice' })).body.shares ?? []) {
    await api(`/api/shares/${share.token}`, { as: 'alice', method: 'DELETE' });
  }
  await api(`/api/playlist/${encodeURIComponent('Moves')}`, { as: 'alice', method: 'DELETE' });
  const { body } = await api('/api/user/files', { as: 'alice' });
  for (const file of body.files ?? []) {
    await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as: 'alice', method: 'DELETE' });
  }
};

test('files and folders are moved and renamed; what was saved and shared follows them', async (t) => {
  t.after(removeAll);
  await upload('small.mp3');
  await upload('photo.jpg');
  assert.equal((await folder('Box')).status, 200);
  assert.equal((await folder('Inner', 'Box')).status, 200);
  const before = await eventually(() => track('Small upload', 'alice'), { what: 'the uploaded track' });

  // Liked, in a playlist, in a public link
  await api('/api/likes/add', { as: 'alice', json: { elements: [before.uid] } });
  assert.equal((await api('/api/playlist', { as: 'alice', json: { name: 'Moves', uids: [before.uid] } })).status, 201);
  const link = (await api('/api/shares', { as: 'alice', json: { paths: ['photo.jpg'] } })).body.token;

  assert.deepEqual((await api('/api/user/files/folders', { as: 'alice' })).body.folders, ['', 'Box', 'Box/Inner']);

  // Moved into a folder
  const moved = await move(['small.mp3', 'photo.jpg'], 'Box');
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual(moved.body.moved, [{ from: 'small.mp3', to: 'Box/small.mp3' }, { from: 'photo.jpg', to: 'Box/photo.jpg' }]);
  assert.ok(fs.existsSync(path.join(ROOT, 'Box/small.mp3')) && !fs.existsSync(path.join(ROOT, 'small.mp3')));

  const after = await track('Small upload', 'alice');
  assert.ok(after, 'still in the library, read again');
  assert.notEqual(after.uid, before.uid, 'a new place, a new uid');
  const likes = (await api('/api/likes/uids', { as: 'alice' })).body;
  assert.ok(likes.includes(after.uid) && !likes.includes(before.uid), 'the like follows');
  assert.deepEqual((await api(`/api/playlist/${encodeURIComponent('Moves')}`, { as: 'alice' })).body.tracks.map((t) => t.uid), [after.uid], 'the playlist follows');
  assert.deepEqual((await api(`/api/share/${link}`)).body.images.map((image) => image.name), ['photo.jpg'], 'the link follows');
  assert.equal((await api(`/api/share/${link}/image/0`)).status, 200);

  // The folder renamed: everything inside follows too
  const renamed = await rename('Box', 'Crate');
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.path, 'Crate');
  const third = await track('Small upload', 'alice');
  assert.ok((await api('/api/likes/uids', { as: 'alice' })).body.includes(third.uid));
  assert.equal((await api(`/api/share/${link}/image/0`)).status, 200);
  assert.ok(fs.existsSync(path.join(ROOT, 'Crate/Inner')));

  // A file renamed
  assert.equal((await rename('Crate/photo.jpg', 'beach.jpg')).body.path, 'Crate/beach.jpg');
  assert.deepEqual((await api(`/api/share/${link}`)).body.images.map((image) => image.name), ['beach.jpg']);

  // Back to the root
  assert.deepEqual((await move(['Crate/small.mp3'], '')).body.moved, [{ from: 'Crate/small.mp3', to: 'small.mp3' }]);
});

test('moves and renames never replace, never leave the uploads, never put a folder in itself', async (t) => {
  t.after(removeAll);
  await upload('small.mp3');
  await folder('A');
  await folder('B', 'A');
  await upload('small.mp3', 'A');

  const refused = await move(['A', 'small.mp3', 'missing.mp3', '.'], 'A/B');
  assert.equal(refused.status, 200, 'the possible move is done');
  assert.deepEqual(refused.body.moved, [{ from: 'small.mp3', to: 'A/B/small.mp3' }]);
  assert.deepEqual(refused.body.failed.map((item) => [item.path, item.message]), [
    ['A', 'A folder cannot go into itself'],
    ['missing.mp3', 'No such file'],
    ['.', 'The uploads folder itself cannot be moved'],
  ]);
  // Already there: not replaced
  const conflict = await move(['A/small.mp3'], 'A/B');
  assert.equal(conflict.status, 400);
  assert.equal(conflict.body.failed[0].message, '“small.mp3” is already there');
  assert.ok(fs.existsSync(path.join(ROOT, 'A/small.mp3')));

  assert.equal((await move(['A/small.mp3'], '../carol')).status, 400);
  assert.equal((await move(['A/small.mp3'], 'nowhere')).status, 400);
  assert.equal((await move(['../../carol/imported'], '')).body.failed[0].message, 'No such file');
  for (const body of [{}, { paths: [], to: '' }, { paths: ['A'] }, { paths: [3], to: '' }]) {
    assert.equal((await api('/api/user/files/move', { as: 'alice', json: body })).status, 400, JSON.stringify(body));
  }

  for (const name of ['', '.', '..', '.hidden', 'a/b', 'a\\\\b', 'x'.repeat(256)]) {
    assert.equal((await rename('A/small.mp3', name)).status, 400, name);
  }
  assert.equal((await rename('A/small.mp3', 'B')).status, 409, 'a folder of that name is there');
  assert.equal((await rename('nothing.mp3', 'other.mp3')).status, 404);
  assert.equal((await rename('.', 'root')).status, 404);
  assert.notEqual((await api('/api/user/files/move', { json: { paths: ['A'], to: '' } })).status, 200, 'a session is needed');
});
