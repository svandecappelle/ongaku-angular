import { test } from 'node:test';
import assert from 'node:assert/strict';

import { albumTracks, api, eventually, track, uidOf } from '../helpers/client.mjs';

const lyrics = async (title, as = 'alice') => (await api(`/api/lyrics/${await uidOf(title)}`, { as })).body;

test('lyrics sources: a .lrc next to the track, the tags, none', async () => {
  const sidecar = await lyrics('Sidecar song');
  assert.equal(sidecar.source, 'file');
  assert.match(sidecar.lrc, /\[00:00\.50\]First line from the file/);
  const tagged = await lyrics('Tagged song');
  assert.equal(tagged.source, 'tags');
  assert.match(tagged.lrc, /Plain lyrics from the tags/);
  assert.deepEqual(await lyrics('No lyrics song'), { source: null, lrc: null });
});

test('lyrics: only administrators write them; everyone reads them; removal falls back', async (t) => {
  const uid = await uidOf('Sidecar song');
  t.after(() => api(`/api/lyrics/${uid}`, { as: 'boss', method: 'DELETE' }));
  assert.equal((await api(`/api/lyrics/${uid}`, { as: 'alice', method: 'PUT', json: { lrc: 'x' } })).status, 403);
  assert.equal((await api(`/api/lyrics/${uid}`, { as: 'alice', method: 'DELETE' })).status, 403);

  const saved = await api(`/api/lyrics/${uid}`, { as: 'boss', method: 'PUT', json: { lrc: '[00:01.00]Hello\n[00:04.00]World' } });
  assert.equal(saved.body.source, 'custom');
  assert.equal((await lyrics('Sidecar song', 'carol')).lrc, '[00:01.00]Hello\n[00:04.00]World');

  const removed = await api(`/api/lyrics/${uid}`, { as: 'boss', method: 'DELETE' });
  assert.equal(removed.body.source, 'file', 'back to the .lrc file');
});

test('lyrics: size limit, bad input, anonymous', async () => {
  const uid = await uidOf('No lyrics song');
  assert.equal((await api(`/api/lyrics/${uid}`, { as: 'boss', method: 'PUT', json: { lrc: 'a'.repeat(300 * 1024) } })).status, 413);
  assert.equal((await api(`/api/lyrics/${uid}`, { as: 'boss', method: 'PUT', json: { lrc: 42 } })).status, 400);
  assert.equal((await api(`/api/lyrics/${uid}`)).status, 401);
  assert.equal((await api('/api/lyrics/nope', { as: 'alice' })).status, 404);
});

test('tags: a user cannot write the tags of a public track', async () => {
  const uid = await uidOf('Retag me');
  const response = await api('/api/audio/metadata/selection/set/', { as: 'alice', method: 'PUT', json: { ids: [uid], metadatas: { artist: 'X' } } });
  assert.equal(response.status, 403);
  assert.equal((await api('/api/audio/metadata/selection/set/', { method: 'PUT', json: { ids: [uid], metadatas: { artist: 'X' } } })).status, 401);
  assert.equal((await api(`/api/audio/metadata/set/${uid}`, { as: 'alice', json: { artist: 'X' } })).status, 403);
});

test('tags: an administrator rewrites them; the track moves to its new album', async () => {
  const uid = await uidOf('Retag me');
  const response = await api('/api/audio/metadata/selection/set/', {
    as: 'boss', method: 'PUT', json: { ids: [uid], metadatas: { artist: 'Retagged', album: 'New Album', title: 'Retagged song', track: '1' } },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.tracks[0].title, 'Retagged song');
  assert.equal(response.body.tracks[0].private, false, 'still public');
  await eventually(async () => (await albumTracks('Retagged', 'New Album')).length === 1, { what: 'the retagged album' });
  assert.equal(await track('Retag me'), undefined);
});

test('library health: covers, tags, duplicates and unreadable files', async () => {
  const health = (await api('/api/admin/library/health', { as: 'boss' })).body;
  assert.equal(health.scanning, false);
  assert.ok(health.withoutCover.some((a) => a.artist === 'Zzyzx Qwertyband' && a.album === 'Nothing Here Nowhere'));
  assert.ok(!health.withoutCover.some((a) => a.album === 'Moon Safari'), 'a folder cover counts');
  const untagged = health.missingTags.find((t) => t.file.endsWith('Misc/Track 03.mp3'));
  assert.deepEqual(untagged?.missing, ['artist', 'album', 'title']);
  assert.equal(health.counts.duplicates, 2);
  const broken = health.unreadable.find((f) => f.file.endsWith('Misc/broken.mp3'));
  assert.ok(broken, 'the unreadable file');
  assert.doesNotMatch(broken.error, /^ffmpeg version/, 'the cause, not the ffmpeg banner');
  assert.equal(health.counts.unreadable, health.unreadable.length);
});
