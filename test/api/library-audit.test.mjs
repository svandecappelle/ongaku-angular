import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MUSIC, api } from '../helpers/client.mjs';

const audit = async () => {
  const { status, body } = await api('/api/admin/library/audit', { as: 'boss' });
  assert.equal(status, 200, JSON.stringify(body));
  return body;
};
const has = (list, file) => list.find((item) => item.file === file || String(item.file).endsWith(`/${file}`));

test('a file with an upper-case extension is in the library and found by the search', async () => {
  const { body } = await api('/api/audio/tracks/filter/Uppercase/0', { as: 'carol' });
  assert.ok(Array.isArray(body) && body.some((track) => track.title === 'Uppercase extension'), JSON.stringify(body).slice(0, 300));
});

test('the audit tells why audio files are not listed', async () => {
  const report = await audit();
  assert.ok(report.counts.audio > 10 && report.counts.listed > 10, JSON.stringify(report.counts));
  assert.equal(report.folders.length, 1);
  assert.equal(report.folders[0].exists, true);

  const disabled = has(report.disabledFormat, 'Audit/Formats/1.m4a');
  assert.equal(disabled?.format, 'm4a', 'a format not enabled');
  assert.ok(!report.enabledFormats.includes('m4a'));
  assert.ok(has(report.unreadable, 'Misc/broken.mp3')?.error, 'an unreadable file, with its error');
  const duplicate = report.duplicates.find((item) => item.file.startsWith('Copies/Discovery/'));
  assert.ok(duplicate?.keptFile, 'a hidden duplicate, with the copy listed instead');
  assert.ok(report.other.txt >= 1, 'other files counted by extension');
  assert.ok(!has(report.notScanned, 'Audit/Caps/1.MP3'), 'the upper-case extension was scanned');
});

test('a file added after the scan and a track whose file is gone are reported', async (t) => {
  const late = path.join(MUSIC, 'Audit/Late/new.mp3');
  const gone = path.join(MUSIC, 'Audit/Gone/1.mp3');
  const moved = path.join(MUSIC, 'Audit/Gone/1.mp3.moved');
  fs.mkdirSync(path.dirname(late), { recursive: true });
  fs.copyFileSync(gone, late);
  fs.renameSync(gone, moved);
  t.after(() => {
    fs.rmSync(path.dirname(late), { recursive: true, force: true });
    if (fs.existsSync(moved)) {
      fs.renameSync(moved, gone);
    }
  });

  const report = await audit();
  assert.equal(has(report.notScanned, 'Audit/Late/new.mp3')?.reason, 'after-scan');
  const missing = has(report.missing, 'Audit/Gone/1.mp3');
  assert.equal(missing?.title, 'Moved away');
  assert.ok(report.counts.missing >= 1 && report.counts.notScanned >= 1);
});

test('the audit and the rescan are for administrators', async () => {
  assert.equal((await api('/api/admin/library/audit', { as: 'carol' })).status, 403);
  assert.equal((await api('/api/admin/library/rescan', { as: 'carol', method: 'POST' })).status, 403);
});
