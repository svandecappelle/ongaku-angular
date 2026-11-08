import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { APP, api } from '../helpers/client.mjs';

/** A folder of 60 files and 3 folders in the uploads of carol, written directly (faster than uploads) */
const FOLDER = 'Paged';
const files = (query) => api(`/api/user/files?path=${FOLDER}&${query}`, { as: 'carol' });

test('the uploads are listed by page, folders first, and filtered by name', async (t) => {
  assert.equal((await api('/api/user/files/folder', { as: 'carol', json: { name: FOLDER } })).status, 200);
  t.after(() => api(`/api/user/files?path=${FOLDER}`, { as: 'carol', method: 'DELETE' }));
  const target = path.join(APP, 'public/user/carol/imported', FOLDER);
  for (let n = 1; n <= 60; n++) {
    fs.writeFileSync(path.join(target, `file-${String(n).padStart(2, '0')}.txt`), 'x'.repeat(n));
  }
  ['Zeta', 'Alpha', 'Été'].forEach((name) => fs.mkdirSync(path.join(target, name)));

  const first = (await files('page=0&size=25')).body;
  assert.deepEqual([first.total, first.page, first.size, first.files.length], [63, 0, 25, 25]);
  assert.deepEqual(first.files.slice(0, 3).map((f) => f.name), ['Alpha', 'Été', 'Zeta'], 'folders first, by name');
  assert.equal(first.files[3].name, 'file-01.txt');
  assert.equal(first.files[3].size, 1, 'the files of the page have their size');

  const last = (await files('page=2&size=25')).body;
  assert.deepEqual([last.page, last.files.length, last.files.at(-1).name], [2, 13, 'file-60.txt']);
  assert.equal((await files('page=99&size=25')).body.page, 2, 'past the end: the last page');
  assert.equal((await files('size=5000')).body.size, 200, 'at most 200 by page');
  assert.equal((await files('')).body.files.length, 50, '50 by default');

  const filtered = (await files('q=FILE-5')).body;
  assert.deepEqual(filtered.files.map((f) => f.name), ['file-50.txt', 'file-51.txt', 'file-52.txt', 'file-53.txt', 'file-54.txt', 'file-55.txt', 'file-56.txt', 'file-57.txt', 'file-58.txt', 'file-59.txt']);
  assert.deepEqual((await files('q=ete')).body.files.map((f) => f.name), ['Été'], 'accents ignored');
  assert.equal((await files('q=nothing-like-this')).body.total, 0);
});
