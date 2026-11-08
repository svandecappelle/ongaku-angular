import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api } from '../helpers/client.mjs';

const tracks = async (query) => {
  const { status, body } = await api(`/api/audio/tracks/filter/${encodeURIComponent(query)}/all`, { as: 'carol' });
  assert.equal(status, 200, `${query}: ${status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.map((track) => track.title);
};
const artists = async (query) => (await api(`/api/audio/artists/filter/${encodeURIComponent(query)}/all`, { as: 'carol' })).body.map((a) => a.name);
const albums = async (query) => (await api(`/api/audio/albums/filter/${encodeURIComponent(query)}/all`, { as: 'carol' })).body.map((a) => `${a.name} / ${a.artist}`);

test('the text typed is not a regular expression', async () => {
  // Punctuation does not count: "C++" searches "c", without an error
  const { status, body } = await api(`/api/audio/tracks/filter/${encodeURIComponent('C++')}/all`, { as: 'carol' });
  assert.equal(status, 200);
  assert.ok(body.length > 0 && body.every((track) => /c/i.test(`${track.title} ${track.artist} ${track.album} ${JSON.stringify(track.metadatas)}`)));
  assert.deepEqual(await tracks('(live'), []);
  assert.deepEqual(await artists('[a'), await artists('a'), 'a bracket is not a regular expression');
  assert.deepEqual(await tracks('.*'), [], 'not "anything"');
});

test('every word is searched in any field, in any order', async () => {
  assert.ok((await tracks('2 discovery')).includes('Discovery 2'));
  assert.ok((await tracks('punk discovery 1')).includes('Discovery 1'), 'artist, album and number');
  assert.ok((await albums('safari air')).includes('Moon Safari / Air'));
  assert.deepEqual(await tracks('discovery radiohead'), [], 'every word must be found');
});

test('accents, case and punctuation do not count', async () => {
  assert.ok((await artists('sigur ros')).includes('Sigur Rós'));
  assert.ok((await artists('SIGUR RÓS')).includes('Sigur Rós'));
  assert.ok((await tracks('svefn g englar')).includes('Svefn-g-englar'));
  assert.ok((await artists('acdc')).includes('AC/DC'));
  assert.ok((await tracks('ac/dc thrill')).includes('Shoot to Thrill'), 'a slash in the search');
  assert.ok((await albums('agæ')).includes('Ágætis byrjun / Sigur Rós'));
});

test('the tags are searched too: album artist and genre', async () => {
  const various = await tracks('various');
  assert.ok(various.includes('Mix Air') && various.includes('Mix Daft Punk'), `album artist: ${various}`);
  assert.ok((await tracks('rock')).some((title) => title.startsWith('OK Computer')), 'genre');
});

test('the most relevant first: a title before an artist', async () => {
  const found = await tracks('air');
  assert.equal(found[0], 'Mix Air', `order: ${found}`);
  assert.ok(found.includes('Moon Safari 1'), 'the tracks of the artist follow');
  assert.equal((await artists('air'))[0], 'Air');
});
