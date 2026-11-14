import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { MUSIC, api, albumTracks, eventually, track } from '../helpers/client.mjs';

/** The watcher waits for a file to stay the same 2 s, then gathers the changes 1.5 s */
const WAIT = { timeout: 20000 };

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  assert.equal(result.status, 0, String(result.stderr));
}

/** Writes an mp3 elsewhere, then moves it in: the watcher sees a whole file */
function song(file, tags, frequency = 2200) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(MUSIC), `${crypto.randomUUID()}.mp3`);
  const metadata = Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value}`]);
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=2`, ...metadata, '-q:a', '9', temporary]);
  fs.renameSync(temporary, file);
}

const coverStatus = async (artist, album) => (await api(`/api/audio/static/covers/${encodeURIComponent(artist)}/${encodeURIComponent(album)}/cover.jpg`, { as: 'carol' })).status;

test('an album copied into the music folders shows by itself, then its cover', async (t) => {
  const folder = path.join(MUSIC, 'Watched Band/First Light');
  t.after(async () => {
    fs.rmSync(path.join(MUSIC, 'Watched Band'), { recursive: true, force: true });
    await eventually(async () => !(await track('Dawn')), { ...WAIT, what: 'the album gone' });
  });

  song(path.join(folder, '1.mp3'), { artist: 'Watched Band', album: 'First Light', title: 'Dawn', track: 1 });
  song(path.join(folder, '2.mp3'), { artist: 'Watched Band', album: 'First Light', title: 'Noon', track: 2 }, 2300);
  await eventually(async () => (await albumTracks('Watched Band', 'First Light', 'carol')).length === 2, { ...WAIT, what: 'the new album' });
  assert.deepEqual((await albumTracks('Watched Band', 'First Light', 'carol')).map((t) => t.title).sort(), ['Dawn', 'Noon']);
  assert.equal(await coverStatus('Watched Band', 'First Light'), 404, 'no cover yet');

  // The cover comes after the tracks (a copy in a different order)
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', path.join(folder, 'cover.jpg')]);
  await eventually(async () => (await coverStatus('Watched Band', 'First Light')) === 200, { ...WAIT, what: 'the cover' });

  // Taken away: the album has no cover again
  fs.rmSync(path.join(folder, 'cover.jpg'));
  await eventually(async () => (await coverStatus('Watched Band', 'First Light')) === 404, { ...WAIT, what: 'the cover gone' });
});

test('a track whose tags change is read again, under the same uid; deleted, it goes away', async (t) => {
  const file = path.join(MUSIC, 'Watched Edits/Single/1.mp3');
  t.after(() => fs.rmSync(path.join(MUSIC, 'Watched Edits'), { recursive: true, force: true }));

  song(file, { artist: 'Edit Band', album: 'Single', title: 'Before the edit', track: 1 });
  const before = await eventually(() => track('Before the edit'), { ...WAIT, what: 'the track' });

  song(file, { artist: 'Edit Band', album: 'Single', title: 'After the edit', track: 1 });
  const after = await eventually(() => track('After the edit'), { ...WAIT, what: 'the new title' });
  assert.equal(after.uid, before.uid, 'the same file: the same uid (playlists keep it)');
  assert.equal(await track('Before the edit'), undefined);

  fs.rmSync(file);
  await eventually(async () => !(await track('After the edit')), { ...WAIT, what: 'the track gone' });
  // The stream of the gone file is refused, not an error
  assert.equal((await api(`/api/audio/stream/${after.uid}`, { as: 'carol' })).status, 404);
});

test('a folder moved inside the music folders keeps its music, under new uids', async (t) => {
  const from = path.join(MUSIC, 'Watched Move/Old');
  const to = path.join(MUSIC, 'Watched Move/New');
  t.after(async () => {
    fs.rmSync(path.join(MUSIC, 'Watched Move'), { recursive: true, force: true });
    await eventually(async () => !(await track('Travelling song')), { ...WAIT, what: 'the moved track gone' });
  });

  song(path.join(from, '1.mp3'), { artist: 'Move Band', album: 'Moving', title: 'Travelling song', track: 1 });
  const first = await eventually(() => track('Travelling song'), { ...WAIT, what: 'the track' });
  fs.renameSync(from, to);
  const moved = await eventually(async () => {
    const found = await track('Travelling song');
    return found && found.uid !== first.uid ? found : null;
  }, { ...WAIT, what: 'the track at its new place' });
  assert.ok(moved);
  assert.equal((await api(`/api/audio/stream/${first.uid}`, { as: 'carol' })).status, 404, 'the old place is gone');
});

test('videos dropped in the music folders show in the Videos page, and leave with their file', async (t) => {
  const file = path.join(MUSIC, 'Videos/Watched/Late arrival.webm');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  const videos = async () => (await api('/api/video', { as: 'carol' })).body.videos.map((video) => video.title);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(MUSIC), `${crypto.randomUUID()}.webm`);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=15:duration=1', '-c:v', 'libvpx', '-b:v', '100k', temporary]);
  fs.renameSync(temporary, file);
  await eventually(async () => (await videos()).includes('Late arrival'), { ...WAIT, what: 'the new video' });

  fs.rmSync(file);
  await eventually(async () => !(await videos()).includes('Late arrival'), { ...WAIT, what: 'the video gone' });
});

test('an unreadable file dropped in is reported by the audit, not listed', async (t) => {
  const file = path.join(MUSIC, 'Watched Broken/broken.mp3');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, crypto.randomBytes(3000));

  const unreadable = async () => (await api('/api/admin/library/audit', { as: 'boss' })).body.unreadable
    .some((item) => String(item.file).endsWith('Watched Broken/broken.mp3'));
  await eventually(unreadable, { ...WAIT, what: 'the file reported as unreadable' });

  // The music folders are watched: the audit tells it
  const report = (await api('/api/admin/library/audit', { as: 'boss' })).body;
  assert.equal(report.watchMode, 'events');
  assert.ok(report.folders.every((folder) => folder.watched), JSON.stringify(report.folders));
});
