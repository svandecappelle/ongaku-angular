import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api, eventually, fileForm, track } from '../helpers/client.mjs';

const setDefaultQuota = (mb) => api('/api/admin/configure', { as: 'boss', json: { uploadQuota: mb } });
const quota = (as) => api('/api/user/quota', { as }).then((r) => r.body);
const upload = (as, file) => api('/api/user/files/upload', { as, form: fileForm(file) });
const removeUploads = async (as) => {
  const { body } = await api('/api/user/files', { as });
  for (const file of body.files ?? []) {
    await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as, method: 'DELETE' });
  }
};

test('no quota by default; administrators never have one', async () => {
  assert.equal((await quota('carol')).quota, null);
  assert.equal((await quota('boss')).quota, null);
});

test('default quota: too large refused before reading (413), small files accepted', async (t) => {
  t.after(async () => {
    await setDefaultQuota(0);
    await removeUploads('carol');
  });
  await setDefaultQuota(0.1);
  const before = await quota('carol');
  assert.equal(before.quota, Math.round(0.1 * 1024 * 1024));

  const big = await upload('carol', 'big.mp3');
  assert.equal(big.status, 413);
  assert.equal(big.body.message, 'Upload quota exceeded');

  const small = await upload('carol', 'small.mp3');
  assert.equal(small.status, 200);
  assert.deepEqual(small.body.files[0].imported, ['small.mp3']);
  const after = await quota('carol');
  assert.ok(after.used > before.used && after.remaining < before.remaining);
  assert.equal((await quota('boss')).quota, null, 'administrators are exempt');
});

test('an archive is imported up to the quota; the rest is reported', async (t) => {
  t.after(async () => {
    await api('/api/admin/users/carol', { as: 'boss', method: 'PUT', json: { uploadQuota: null } });
    await removeUploads('carol');
  });
  // Each wav is 88 KB: room for one of the three (the zip itself is tiny)
  await api('/api/admin/users/carol', { as: 'boss', method: 'PUT', json: { uploadQuota: 0.12 } });
  const result = await upload('carol', 'silence.zip');
  assert.equal(result.status, 200);
  assert.equal(result.body.files[0].imported.length, 1);
  assert.match(result.body.files[0].error, /2 file\(s\) skipped/);
});

test('quota of a user: custom, unlimited, back to the default; refused when negative', async (t) => {
  t.after(() => api('/api/admin/users/carol', { as: 'boss', method: 'PUT', json: { uploadQuota: null } }));
  await api('/api/admin/users/carol', { as: 'boss', method: 'PUT', json: { uploadQuota: 2 } });
  assert.equal((await quota('carol')).quota, 2 * 1024 * 1024);
  const listed = (await api('/api/admin/users', { as: 'boss' })).body.find((u) => u.username === 'carol');
  assert.equal(listed.uploadQuota, 2);
  await api('/api/admin/users/carol', { as: 'boss', method: 'PUT', json: { uploadQuota: 0 } });
  assert.equal((await quota('carol')).quota, null, '0 is unlimited');
  assert.equal((await api('/api/admin/users/carol', { as: 'boss', method: 'PUT', json: { uploadQuota: -3 } })).status, 400);
});

test('a zip is unpacked with its folders', async (t) => {
  t.after(() => removeUploads('carol'));
  const result = await upload('carol', 'three.zip');
  assert.deepEqual(result.body.files[0].imported, ['Band/z1.mp3', 'Band/z2.mp3', 'Band/z3.mp3']);
  const folder = (await api('/api/user/files?path=Band', { as: 'carol' })).body;
  assert.deepEqual(folder.files.map((f) => f.name), ['z1.mp3', 'z2.mp3', 'z3.mp3']);
  assert.equal((await api('/api/user/files?path=../../etc', { as: 'carol' })).status, 400, 'paths stay in the uploads');
});

test('private uploads are only visible to their owner', async (t) => {
  t.after(() => removeUploads('alice'));
  assert.equal((await upload('alice', 'private.mp3')).status, 200);
  await eventually(() => track('Private upload', 'alice'), { what: 'the upload in the library of alice' });

  assert.ok(await track('Private upload', 'alice'));
  assert.equal(await track('Private upload', 'carol'), undefined, 'search of another user');
  assert.equal(await track('Private upload', 'boss'), undefined, 'search of an administrator');
  const artists = (await api('/api/audio/artists/filter/Secret/all', { as: 'carol' })).body;
  assert.deepEqual(artists, [], 'artists of another user');
  assert.deepEqual((await api('/api/audio/albums/filter/Hidden/all', { as: 'carol' })).body, [], 'albums of another user');
  assert.deepEqual((await api('/api/audio/album/Secret%20Band/Hidden%20Album', { as: 'carol' })).body, []);
  assert.equal((await api('/api/audio/albums/filter/Hidden/all', { as: 'alice' })).body.length, 1, 'visible to its owner');
});

test('uploads need a session', async () => {
  assert.notEqual((await api('/api/user/files/upload', { form: fileForm('small.mp3') })).status, 200);
});

test('several uploads are deleted at once, folders with their content; the library follows', async (t) => {
  t.after(() => removeUploads('alice'));
  const names = async () => (await api('/api/user/files', { as: 'alice' })).body.files.map((file) => file.name).sort();
  assert.equal((await upload('alice', 'small.mp3')).status, 200);
  assert.equal((await upload('alice', 'private.mp3')).status, 200);
  assert.equal((await api('/api/user/files/folder', { as: 'alice', json: { name: 'Kept' } })).status, 200);
  assert.equal((await api('/api/user/files/folder', { as: 'alice', json: { name: 'Gone' } })).status, 200);
  const intoGone = await api('/api/user/files/upload?path=Gone', { as: 'alice', form: fileForm('three.zip') });
  assert.equal(intoGone.status, 200, JSON.stringify(intoGone.body));
  await eventually(() => track('Zipped 1', 'alice'), { what: 'the tracks of the folder' });
  await eventually(() => track('Small upload', 'alice'), { what: 'the uploaded track' });

  // A folder and a file inside it, a file, a path out of the uploads, the uploads folder itself
  const answer = await api('/api/user/files/delete', { as: 'alice', json: { paths: ['Gone', 'Gone/Band/z1.mp3', 'small.mp3', '../../carol', '.'] } });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.deepEqual(answer.body.deleted.sort(), ['Gone', 'Gone/Band/z1.mp3', 'small.mp3']);
  assert.deepEqual(answer.body.failed.map((item) => item.path).sort(), ['.', '../../carol']);
  assert.deepEqual(await names(), ['Kept', 'private.mp3']);

  // The library was read again before the answer
  assert.equal(await track('Small upload', 'alice'), undefined);
  assert.equal(await track('Zipped 2', 'alice'), undefined);
  assert.ok(await track('Private upload', 'alice'), 'the file not chosen stays');

  // Nothing to delete, wrong requests, no session
  assert.equal((await api('/api/user/files/delete', { as: 'alice', json: { paths: ['not-there.mp3'] } })).status, 400);
  for (const body of [{}, { paths: [] }, { paths: 'small.mp3' }, { paths: [3] }, { paths: [''] }, { paths: Array(1001).fill('x') }]) {
    assert.equal((await api('/api/user/files/delete', { as: 'alice', json: body })).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.notEqual((await api('/api/user/files/delete', { json: { paths: ['private.mp3'] } })).status, 200);
  assert.deepEqual(await names(), ['Kept', 'private.mp3']);
});
