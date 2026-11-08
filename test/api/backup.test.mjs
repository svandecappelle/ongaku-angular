import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

import { BASE, api, eventually, login } from '../helpers/client.mjs';

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-backup-test-'));

/** Downloads a backup as boss into a file; resolves with its path */
async function download(query = '') {
  const response = await fetch(`${BASE}/api/admin/backup${query}`, { headers: { Cookie: await login('boss') } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/x-tar');
  assert.match(response.headers.get('content-disposition'), /attachment; filename="ongaku-backup-\d{8}-\d{4}(-with-music)?\.tar"/);
  const file = path.join(folder, `backup-${Date.now()}.tar`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
  return file;
}

async function entries(file) {
  const list = [];
  await tar.t({ file, onReadEntry: (entry) => list.push(entry.path) });
  return list;
}

const restore = async (body) => {
  const response = await fetch(`${BASE}/api/admin/backup/restore`, {
    method: 'POST',
    headers: { Cookie: await login('boss'), 'Content-Type': 'application/x-tar' },
    body,
  });
  return { status: response.status, body: await response.json() };
};

/** The rescan after a restore is over: the library is back */
const libraryBack = () => eventually(async () => {
  const health = await api('/api/admin/library/health', { as: 'boss' });
  const tracks = await api('/api/audio/tracks/filter/Sidecar/0', { as: 'boss' });
  return health.status === 200 && !health.body.scanning && Array.isArray(tracks.body) && tracks.body.length > 0;
}, { timeout: 30000, what: 'the library after the restore' });

test('the summary tells what a backup holds', async () => {
  const { status, body } = await api('/api/admin/backup/summary', { as: 'boss' });
  assert.equal(status, 200);
  assert.ok(body.database.keys > 10);
  assert.deepEqual(body.data.map((item) => item.name), ['user', 'artists-covers', 'lyrics']);
  assert.equal(body.music.length, 1);
  assert.ok(body.music[0].exists && body.music[0].size > 0);
  assert.equal((await api('/api/admin/backup/summary', { as: 'carol' })).status, 403);
  assert.equal((await api('/api/admin/backup', { as: 'carol' })).status, 403);
});

test('a backup without the music: manifest first, the database without sessions, the data', async () => {
  const file = await download();
  const list = await entries(file);
  assert.equal(list[0], 'manifest.json');
  assert.ok(list.includes('database.jsonl'));
  assert.ok(list.some((entry) => entry.startsWith('data/')), 'the data folders');
  assert.ok(list.includes('config/application.yml'), 'the configuration, for reference');
  assert.ok(!list.some((entry) => entry.startsWith('music/')), 'no music');

  let database = '';
  await tar.x({ file, cwd: folder, filter: (entry) => entry === 'database.jsonl' || entry === 'manifest.json' });
  database = fs.readFileSync(path.join(folder, 'database.jsonl'), 'utf8');
  const keys = database.trim().split('\n').map((line) => JSON.parse(line).key);
  assert.ok(keys.includes('username:uid'), 'the accounts');
  assert.ok(!keys.some((key) => key.startsWith('ongaku:sess:')), 'no session');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  assert.deepEqual([manifest.format, manifest.version, manifest.database.keys], ['ongaku-backup', 1, keys.length]);
});

test('a backup with the music, restored: the data comes back as it was saved', async (t) => {
  t.after(() => api(`/api/playlist/${encodeURIComponent('Backup probe')}`, { as: 'carol', method: 'DELETE' }));
  assert.equal((await api('/api/playlist', { as: 'carol', json: { name: 'Backup probe' } })).status, 201);

  const file = await download('?music=1');
  const list = await entries(file);
  assert.ok(list.includes('music/0-music/Air/Moon Safari/1.mp3'), 'the music folders');

  // Changed after the backup: the restore puts it back
  assert.equal((await api(`/api/playlist/${encodeURIComponent('Backup probe')}`, { as: 'carol', method: 'DELETE' })).status, 200);
  const { status, body } = await restore(fs.readFileSync(file));
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.database > 10);
  assert.ok(body.music.files > 10, 'the music written back');
  assert.equal(body.rescan, 'started');
  await libraryBack();

  const playlists = (await api('/api/playlist', { as: 'carol' })).body;
  assert.ok(JSON.stringify(playlists).includes('Backup probe'), 'the playlist is back; the session of carol stayed');
});

test('what is not a backup is refused, and nothing is changed', async () => {
  const before = (await api('/api/admin/backup/summary', { as: 'boss' })).body.database.keys;
  assert.equal((await restore(Buffer.from('not a tar file at all'.repeat(100)))).status, 400);

  // A tar without the manifest first
  const other = path.join(folder, 'other');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, 'database.jsonl'), '{"key":"intruder","type":"string","ttl":-1,"value":"x"}\n');
  const file = path.join(folder, 'other.tar');
  await tar.c({ file, cwd: other }, ['database.jsonl']);
  const refused = await restore(fs.readFileSync(file));
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /not an Ongaku backup/);
  assert.equal((await api('/api/admin/backup/summary', { as: 'boss' })).body.database.keys, before);
});

test.after(() => fs.rmSync(folder, { recursive: true, force: true }));
