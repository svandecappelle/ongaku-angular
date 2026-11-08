import { test } from 'node:test';
import assert from 'node:assert/strict';

import { albumTracks, api } from '../helpers/client.mjs';

const tail = (file) => file.split('/music/')[1];

async function duplicates() {
  return (await api('/api/admin/library/duplicates', { as: 'boss' })).body;
}

/** The hidden copy and the listed one of a Discovery track */
async function copiesOf(title) {
  const group = (await duplicates()).groups.find((g) => g.kept.title === title);
  assert.ok(group, `a duplicate group for ${title}`);
  return { kept: group.kept, hidden: group.copies[0] };
}

test('an album lists each track once', async () => {
  const titles = (await albumTracks('Daft Punk', 'Discovery')).map((t) => t.title);
  assert.deepEqual(titles, ['Discovery 1', 'Discovery 2', 'Discovery 3']);
});

test('duplicates report: the flac copy, then the copy of the complete album, is listed', async () => {
  const report = await duplicates();
  assert.equal(report.enabled, true);
  assert.equal(report.hidden, 2);
  const one = report.groups.find((g) => g.kept.title === 'Discovery 1');
  assert.equal(tail(one.kept.file), 'Copies/Discovery/01.flac', 'best format first');
  assert.equal(one.kept.format, 'flac');
  assert.deepEqual(one.copies.map((c) => tail(c.file)), ['Daft Punk/Discovery/1.mp3']);
  const two = report.groups.find((g) => g.kept.title === 'Discovery 2');
  assert.equal(tail(two.kept.file), 'Daft Punk/Discovery/2.mp3', 'the copy of the complete album');
});

test('a hidden copy saved in a library, likes or a playlist stands for the listed one', async (t) => {
  const { kept, hidden } = await copiesOf('Discovery 2');
  t.after(async () => {
    await api('/api/user/library/remove', { as: 'carol', json: { elements: [kept.uid] } });
    await api('/api/likes/remove', { as: 'carol', json: { elements: [kept.uid] } });
    await api('/api/playlist/Hidden%20copy', { as: 'carol', method: 'DELETE' });
  });

  await api('/api/user/library/add', { as: 'carol', json: { elements: [hidden.uid] } });
  assert.ok((await api('/api/user/library/uids', { as: 'carol' })).body.includes(kept.uid));
  const content = (await api('/api/user/library/content', { as: 'carol' })).body;
  assert.ok(content.albums.flatMap((a) => a.tracks).some((tr) => tr.uid === kept.uid));

  await api('/api/likes/add', { as: 'carol', json: { elements: [hidden.uid] } });
  assert.ok((await api('/api/likes', { as: 'carol' })).body.tracks.some((tr) => tr.uid === kept.uid));

  const playlist = await api('/api/playlist', { as: 'carol', json: { name: 'Hidden copy', uids: [hidden.uid, kept.uid] } });
  assert.deepEqual(playlist.body.tracks.map((tr) => tr.uid), [kept.uid], 'both copies: once');

  // Removing the listed track removes the hidden copy saved earlier
  await api('/api/user/library/remove', { as: 'carol', json: { elements: [kept.uid] } });
  assert.ok(!(await api('/api/user/library/uids', { as: 'carol' })).body.includes(hidden.uid));
});

test('the deduplication can be turned off by an administrator', async (t) => {
  t.after(() => api('/api/admin/configure', { as: 'boss', json: { deduplicate: true } }));
  await api('/api/admin/configure', { as: 'boss', json: { deduplicate: false } });
  // The two hidden copies are listed again (the artist is compared case insensitively)
  assert.equal((await albumTracks('Daft Punk', 'Discovery')).length, 3 + 2);
  assert.equal((await duplicates()).enabled, false);
  await api('/api/admin/configure', { as: 'boss', json: { deduplicate: true } });
  assert.equal((await albumTracks('Daft Punk', 'Discovery')).length, 3);
});

test('albums of the same title by two artists stay apart', async () => {
  assert.deepEqual((await albumTracks('Queen', 'Greatest Hits')).map((t) => t.title), ['Greatest Hits 1', 'Greatest Hits 2']);
  assert.ok((await albumTracks('Queen', 'Greatest Hits')).every((t) => t.artist === 'Queen'));
  assert.ok((await albumTracks('ABBA', 'Greatest Hits')).every((t) => t.artist === 'ABBA'));
  assert.equal((await albumTracks('queen', 'Greatest Hits')).length, 2, 'artist case insensitive');
  assert.deepEqual((await api('/api/audio/album/Queen/Nope', { as: 'boss' })).body, []);

  const artists = (await api('/api/audio/album-artists/Greatest%20Hits', { as: 'boss' })).body.map((a) => a.artist).sort();
  assert.deepEqual(artists, ['ABBA', 'Queen']);
  const list = (await api('/api/audio/albums/filter/Greatest/all', { as: 'boss' })).body;
  assert.deepEqual(list.map((a) => a.artist).sort(), ['ABBA', 'Queen']);
});

test('a compilation is one album under its album artist', async () => {
  const tracks = await albumTracks('Various Artists', 'Summer Mix');
  assert.deepEqual(tracks.map((t) => t.artist), ['Air', 'Daft Punk']);
  const group = (await api('/api/audio/album/Various%20Artists/Summer%20Mix', { as: 'boss' })).body[0].albums[0];
  assert.equal(group.artist, 'Various Artists');
  assert.ok(['Air', 'Daft Punk'].includes(group.coverArtist), 'covers stay under the artist of a track');
});
