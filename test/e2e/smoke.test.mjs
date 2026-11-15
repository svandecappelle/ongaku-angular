import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { APP, ASSETS, MUSIC, api, eventually, fileForm, login } from '../helpers/client.mjs';
import { openBrowser } from '../helpers/browser.mjs';

const skip = !process.env.CHROME ? 'no Chromium (set CHROME)' : !process.env.ONGAKU_TEST_CLIENT ? 'client not built (client/dist)' : false;

let page;
before(async () => {
  if (!skip) {
    page = await openBrowser();
  }
});
after(async () => {
  await page?.close();
});

/** Clicks the play button of the row of this title */
const playRow = (title) => page.eval(`[...document.querySelectorAll('app-track-list tbody tr')]
  .find((row) => row.querySelector('.title').textContent.trim() === ${JSON.stringify(title)}).querySelector('button.number').click()`);
const playerTitle = () => page.eval(`document.querySelector('app-player-bar .now-playing .title')?.textContent.trim() ?? null`);

test('the login page renders for an anonymous visitor', { skip }, async () => {
  await page.goto('/login');
  await page.waitFor(`document.querySelector('input[type=password]')`, { what: 'the login form' });
  assert.equal(await page.eval(`!!document.querySelector('app-shell')`), false, 'no shell before login');
});

/** Fills the login form and submits it */
const signIn = (username, password) => page.eval(`(() => {
  const set = (selector, value) => {
    const input = document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('input[autocomplete=username]', ${JSON.stringify(username)});
  set('input[autocomplete=current-password]', ${JSON.stringify(password)});
  document.querySelector('app-login button[type=submit]').click();
})()`);

test('a wrong password is told; signing in goes back to the page asked for', { skip }, async () => {
  await page.goto('/profile');
  await page.waitFor(`location.pathname === '/login' && new URLSearchParams(location.search).get('returnUrl') === '/profile'`, { what: 'the login page with the page asked for' });
  await page.waitFor(`document.querySelector('app-login input[autocomplete=username]')`, { what: 'the login form' });

  await signIn('carol', 'not-the-password');
  await page.waitFor(`document.querySelector('app-login .error')`, { what: 'the error message' });
  assert.equal(await page.eval(`document.querySelector('app-login .error-text').textContent.trim()`), 'Wrong user name or password.');
  await signIn('nobody', 'whatever1');
  await page.waitFor(`document.querySelector('app-login .error') && !document.querySelector('app-login button[type=submit]').disabled`, { what: 'the second answer' });
  assert.equal(await page.eval(`document.querySelector('app-login .error-text').textContent.trim()`), 'Wrong user name or password.', 'an unknown user: same message');

  await signIn('carol', 'carolpass1');
  await page.waitFor(`location.pathname === '/profile' && document.querySelector('app-shell')`, { what: 'the profile after signing in' });
  assert.equal(await page.eval(`!!document.querySelector('app-login')`), false);
});

/** Fills inputs by form control name, then submits the form of the page */
const fillAndSubmit = (host, fields) => page.eval(`(() => {
  for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
    const input = document.querySelector('${host} input[formcontrolname=' + name + ']');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  document.querySelector('${host} button[type=submit]').click();
})()`);

test('sign up from the login page creates the account and signs it in', { skip }, async (t) => {
  t.after(async () => {
    await api('/api/admin/users/joiner', { as: 'boss', method: 'DELETE' });
    await api('/api/admin/configure', { as: 'boss', json: { allowRegisteration: 0 } });
  });
  await api('/api/admin/configure', { as: 'boss', json: { allowRegisteration: 20 } });
  await page.goto('/login');
  await page.waitFor(`document.querySelector('app-login .footer a[href="/register"]')`, { what: 'the sign up link' });
  await page.eval(`document.querySelector('app-login .footer a').click()`);
  await page.waitFor(`document.querySelector('app-register input[formcontrolname=username]')`, { what: 'the sign up form' });

  await fillAndSubmit('app-register', { username: 'joiner', email: 'joiner@test.io', password: 'joinerpass1', confirmPassword: 'other-pass' });
  await page.waitFor(`document.querySelector('app-register .field-error')`, { what: 'the mismatch message' });
  await fillAndSubmit('app-register', { username: 'carol', email: 'joiner@test.io', password: 'joinerpass1', confirmPassword: 'joinerpass1' });
  await page.waitFor(`document.querySelector('app-register .error-text')`, { what: 'the server refusal' });
  assert.equal(await page.eval(`document.querySelector('app-register .error-text').textContent.trim()`), 'This user name is already used');

  await fillAndSubmit('app-register', { username: 'joiner' });
  await page.waitFor(`location.pathname === '/' && document.querySelector('app-shell')`, { what: 'the shell after signing up' });
  assert.equal(await page.eval(`fetch('/api/auth/').then((res) => res.json()).then((auth) => auth.username)`), 'joiner', 'signed in as the new user');
});

test('sign up closed and an installed server are told', { skip }, async () => {
  await page.goto('/register');
  await page.waitFor(`document.querySelector('app-register .notice')`, { what: 'the closed message' });
  assert.match(await page.eval(`document.querySelector('app-register .notice').textContent`), /Sign up is closed/);
  await page.goto('/install');
  await page.waitFor(`location.pathname === '/login'`, { what: 'the login page' });
});

test('Discover shows artists and albums', { skip }, async () => {
  await page.goto('/', await login('boss'));
  await page.waitFor(`document.querySelectorAll('app-album-card').length > 0`, { what: 'album cards' });
  const albums = await page.eval(`[...document.querySelectorAll('app-album-card .album-link')].map((a) => a.textContent.trim())`);
  assert.ok(albums.includes('Discovery'), `albums: ${albums}`);
  assert.ok(await page.eval(`document.querySelectorAll('app-artist-card').length > 0`), 'artist cards');
});

test('an album page plays a track in the player bar', { skip }, async () => {
  await page.goto('/album/Lyric%20Band/Songs', await login('boss'));
  await page.waitFor(`document.querySelectorAll('app-track-list tbody tr').length === 3`, { what: 'the tracks' });
  await playRow('Sidecar song');
  await page.waitFor(`document.querySelector('app-player-bar .now-playing .title')?.textContent.trim() === 'Sidecar song'`, { what: 'the player bar' });
});

test('the track playing is given to the system media controls', { skip }, async () => {
  // Continues the previous test: Sidecar song is playing
  await page.waitFor(`navigator.mediaSession.playbackState === 'playing'`, { what: 'the media session state' });
  const metadata = await page.eval(`(({ title, artist, album, artwork }) => ({ title, artist, album, artwork: artwork.map((a) => a.src) }))(navigator.mediaSession.metadata)`);
  assert.equal(metadata.title, 'Sidecar song');
  assert.equal(metadata.artist, 'Lyric Band');
  assert.equal(metadata.album, 'Songs');
  assert.match(metadata.artwork[0], /^http:\/\/[^/]+\/api\/audio\/song-image\/.+/);
  // The player pauses: so do the system controls
  await page.eval(`document.querySelector('app-player-bar .play').click()`);
  await page.waitFor(`navigator.mediaSession.playbackState === 'paused'`, { what: 'the paused media session' });
  await page.eval(`document.querySelector('app-player-bar .play').click()`);
  await page.waitFor(`navigator.mediaSession.playbackState === 'playing'`, { what: 'the media session playing again' });
});

test('the app can be installed (web manifest)', { skip }, async () => {
  const manifest = await page.eval(`fetch(document.querySelector('link[rel=manifest]').href).then((res) => res.json())`);
  assert.equal(manifest.display, 'standalone');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), `icons: ${sizes}`);
});

test('the queue is back after a reload, paused', { skip }, async () => {
  // Continues the previous test: Sidecar song is playing
  await page.waitFor(`localStorage.getItem('ongaku.queue.boss')`, { what: 'the saved queue' });
  await page.reload();
  await page.waitFor(`document.querySelector('app-player-bar .now-playing .title')`, { what: 'the restored player' });
  assert.equal(await playerTitle(), 'Sidecar song');
  assert.equal(await page.eval(`document.querySelector('app-player-bar .play').getAttribute('aria-label')`), 'Play', 'paused');
});

test('the lyrics of the track show in the full-screen player', { skip }, async () => {
  await page.waitFor(`document.querySelector('app-player-bar .lyrics-button')`, { what: 'the lyrics button' });
  await page.eval(`document.querySelector('app-player-bar .lyrics-button').click()`);
  await page.waitFor(`document.querySelectorAll('app-lyrics-view .line').length === 4`, { what: 'the lyrics lines' });
  assert.equal(await page.eval(`document.querySelector('app-lyrics-view .line').textContent.trim()`), 'First line from the file');
});

test('a track listened to is in Recently played and the listening figures', { skip }, async (t) => {
  t.after(() => api('/api/history', { as: 'carol', method: 'DELETE' }));
  const carol = await login('carol');
  await page.goto('/album/Air/Moon%20Safari', carol);
  await page.waitFor(`document.querySelectorAll('app-track-list tbody tr').length === 2`, { what: 'the tracks' });
  // A 2 second track: played to its end, it counts
  await playRow('Moon Safari 1');
  await eventually(async () => (await api('/api/history', { as: 'carol' })).body.tracks.length > 0, { what: 'the recorded play' });

  await page.goto('/', carol);
  await page.waitFor(`document.querySelector('#recent-title')`, { what: 'Recently played' });
  const recent = await page.eval(`[...document.querySelector('#recent-title').parentElement.querySelectorAll('app-album-card .album-link')].map((a) => a.textContent.trim())`);
  assert.deepEqual(recent, ['Moon Safari']);

  await page.goto('/profile', carol);
  await page.waitFor(`document.querySelector('#listening-title')`, { what: 'the listening figures' });
  const plays = await page.eval(`Number(document.querySelector('.listening .figure-value').textContent)`);
  assert.ok(plays >= 1, `plays this month: ${plays}`);
  assert.equal(await page.eval(`document.querySelectorAll('.listening .bar').length`), 7);
  assert.equal(await page.eval(`document.querySelector('.listening .top-artists a').textContent.trim()`), 'Air');
});

test('the Health tab of the administration renders', { skip }, async () => {
  await page.goto('/admin', await login('boss'));
  await page.waitFor(`[...document.querySelectorAll('.mdc-tab')].some((tab) => tab.textContent.includes('Health'))`, { what: 'the tabs' });
  await page.eval(`[...document.querySelectorAll('.mdc-tab')].find((tab) => tab.textContent.includes('Health')).click()`);
  await page.waitFor(`document.querySelectorAll('.mat-mdc-tab-body-active .tile').length === 4`, { what: 'the health tiles' });
  const sections = await page.eval(`[...document.querySelectorAll('.mat-mdc-tab-body-active section h2')].map((h) => h.textContent.trim())`);
  assert.deepEqual(sections, ['Albums without cover', 'Tracks with missing tags', 'Duplicates', 'Unreadable files']);
});

test('an internet station plays live from the Radios page, then a track takes over', { skip }, async (t) => {
  // A small radio: an MP3 of the fixture in a loop, with ICY titles every 4 KB
  const METAINT = 4096;
  const TITLE = 'Browser Band - On Air';
  const audio = fs.readFileSync(path.join(MUSIC, 'Air/Moon Safari/1.mp3'));
  const meta = Buffer.from(`StreamTitle='${TITLE}';`);
  const block = Buffer.alloc(1 + Math.ceil(meta.length / 16) * 16);
  block[0] = (block.length - 1) / 16;
  meta.copy(block, 1);
  const radio = http.createServer((req, res) => {
    const icy = req.headers['icy-metadata'] === '1';
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'icy-name': 'Browser FM', ...(icy ? { 'icy-metaint': String(METAINT) } : {}) });
    let offset = 0;
    const send = () => {
      for (let i = 0; i < 8; i++) {
        const piece = Buffer.alloc(METAINT);
        for (let filled = 0; filled < METAINT;) {
          const size = Math.min(METAINT - filled, audio.length - offset);
          audio.copy(piece, filled, offset, offset + size);
          filled += size;
          offset = (offset + size) % audio.length;
        }
        res.write(icy ? Buffer.concat([piece, block]) : piece);
      }
    };
    send();
    const timer = setInterval(send, 250);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => radio.listen(0, '127.0.0.1', resolve));
  const created = await api('/api/radios', { as: 'boss', json: { name: 'Browser FM', genre: 'Test', url: `http://127.0.0.1:${radio.address().port}/live.mp3` } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  t.after(async () => {
    await api(`/api/radios/${created.body.id}`, { as: 'boss', method: 'DELETE' });
    radio.closeAllConnections();
    radio.close();
  });

  await page.goto('/radios', await login('carol'));
  await page.waitFor(`[...document.querySelectorAll('app-radios-page .station-name')].some((n) => n.textContent.trim() === 'Browser FM')`, { what: 'the station' });
  assert.equal(await page.eval(`!!document.querySelector('app-radios-page .create')`), false, 'no "Add a station" for a member');
  await page.eval(`[...document.querySelectorAll('app-radios-page .station')].find((row) => row.querySelector('.station-name').textContent.trim() === 'Browser FM').querySelector('button.play').click()`);

  await page.waitFor(`document.querySelector('app-player-bar .live-badge.on')`, { what: 'the live badge playing' });
  await page.waitFor(`document.querySelector('app-player-bar .now-playing .sub')?.textContent.trim() === ${JSON.stringify(TITLE)}`, { what: 'the title on air', timeout: 15000 });
  assert.equal(await page.eval(`document.querySelector('app-player-bar .now-playing .title').textContent.trim()`), 'Browser FM');
  assert.equal(await page.eval(`navigator.mediaSession.metadata.title`), TITLE);
  assert.equal(await page.eval(`document.querySelector('app-player-bar .seek')`), null, 'no seek bar on live radio');

  await page.eval(`document.querySelector('app-player-bar .play').click()`);
  await page.waitFor(`document.querySelector('app-player-bar .live-badge:not(.on)')`, { what: 'the paused station' });

  // A track played afterwards leaves the live mode
  await page.goto('/album/Lyric%20Band/Songs', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-track-list tbody tr').length === 3`, { what: 'the tracks' });
  await playRow('Tagged song');
  await page.waitFor(`document.querySelector('app-player-bar .now-playing .title')?.textContent.trim() === 'Tagged song' && document.querySelector('app-player-bar .seek')`, { what: 'the track with its seek bar' });
});

test('a library station starts from the Radios page and says why each track was picked', { skip }, async () => {
  await page.goto('/radios', await login('carol'));
  await page.waitFor(`document.querySelector('app-radios-page .mix h3')?.textContent.trim() === 'Made for carol'`, { what: 'the mix' });
  await page.waitFor(`[...document.querySelectorAll('app-radios-page .library-name')].some((n) => n.textContent.trim() === 'Electronic')`, { what: 'the genre station' });
  await page.eval(`[...document.querySelectorAll('app-radios-page .library-card')].find((card) => card.querySelector('.library-name').textContent.trim() === 'Electronic').querySelector('.library-play').click()`);

  await page.waitFor(`document.querySelector('app-radios-page .library-card.current .library-name')?.textContent.trim() === 'Electronic'`, { what: 'the station playing' });
  const title = await page.eval(`document.querySelector('app-player-bar .now-playing .title')?.textContent.trim()`);
  assert.match(title, /^(Discovery|Moon Safari) \d$/, `an Electronic track: ${title}`);

  await page.eval(`document.querySelector('app-player-bar .now-playing').click()`);
  await page.waitFor(`document.querySelector('app-player-bar .sheet .eyebrow')?.textContent.trim() === 'Radio · Electronic'`, { what: 'the radio in the full player' });
  assert.match(await page.eval(`document.querySelector('app-player-bar .sheet .reason').textContent`), /Picked: (liked|same genre)/);
  await page.eval(`document.querySelector('app-player-bar .sheet button[aria-label="Hide the player"]').click()`);
});

test('the Files tab of the administration tells why files are not listed', { skip }, async () => {
  await page.goto('/admin', await login('boss'));
  await page.waitFor(`[...document.querySelectorAll('.mdc-tab')].some((tab) => tab.textContent.trim() === 'Files')`, { what: 'the tabs' });
  await page.eval(`[...document.querySelectorAll('.mdc-tab')].find((tab) => tab.textContent.trim() === 'Files').click()`);
  await page.waitFor(`document.querySelectorAll('.mat-mdc-tab-body-active .tile').length === 6`, { what: 'the audit tiles' });
  const formats = await page.eval(`[...document.querySelectorAll('#files-formats code')].map((c) => c.textContent.trim())`);
  assert.ok(formats.includes('Audit/Formats/1.m4a'), `formats: ${formats}`);
  // The filter keeps the matching paths
  await page.eval(`(() => { const input = document.querySelector('.files-filter input'); input.value = 'Misc'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.waitFor(`![...document.querySelectorAll('#files-formats code')].some((c) => c.textContent.includes('Audit/Formats'))`, { what: 'the filtered list' });
  assert.ok(await page.eval(`[...document.querySelectorAll('#files-unreadable code')].some((c) => c.textContent.includes('Misc/broken.mp3'))`));
});

test('a large uploads folder is shown by page, and can be filtered', { skip }, async (t) => {
  await api('/api/user/files/folder', { as: 'carol', json: { name: 'Big folder' } });
  t.after(() => api(`/api/user/files?path=${encodeURIComponent('Big folder')}`, { as: 'carol', method: 'DELETE' }));
  const target = path.join(APP, 'public/user/carol/imported/Big folder');
  for (let n = 1; n <= 63; n++) {
    fs.writeFileSync(path.join(target, `note-${n}.txt`), 'x');
  }

  await page.goto('/my-library?tab=uploads&path=Big%20folder', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file').length === 50`, { what: 'the first page' });
  assert.ok(await page.eval(`!!document.querySelector('app-uploads-browser mat-paginator')`), 'a paginator');
  await page.eval(`document.querySelector('app-uploads-browser .mat-mdc-paginator-navigation-next').click()`);
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file').length === 13`, { what: 'the second page' });
  assert.equal(await page.eval(`document.querySelector('app-uploads-browser .file-name').textContent.trim()`), 'note-51.txt', 'natural order');

  await page.eval(`(() => { const input = document.querySelector('app-uploads-browser .filter input'); input.value = 'note-6'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  // note-6 and note-60 to note-63
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file').length === 5`, { what: 'the filtered files' });
});

/** Opens Appearance and clicks the button of a toggle group whose text ends with `choice` */
async function appearance(group, choice) {
  await page.goto('/profile/appearance', await login('carol'));
  await page.waitFor(`document.querySelector('${group}')`, { what: `the setting ${group}` });
  await page.eval(`[...document.querySelectorAll('${group} button')].find((b) => b.textContent.trim().endsWith(${JSON.stringify(choice)})).click()`);
}
const MOVEMENT = '.visualizers .movement';
const PLAYER_ANIMATION = '[aria-labelledby="player-animation-label"]';

/** Opens Appearance and chooses where the seek bar draws the waveform */
async function waveformPlaces({ bar, full }) {
  const group = '.waveform-places';
  await page.goto('/profile/appearance', await login('carol'));
  await page.waitFor(`document.querySelector('${group} button')`, { what: 'the places of the waveform' });
  for (const [label, wanted] of [['Player bar', bar], ['Full screen', full]]) {
    await page.eval(`(() => { const b = [...document.querySelectorAll('${group} button')].find((b) => b.textContent.includes(${JSON.stringify(label)})); if ((b.getAttribute('aria-pressed') === 'true') !== ${wanted}) b.click(); })()`);
    await page.waitFor(`[...document.querySelectorAll('${group} button')].find((b) => b.textContent.includes(${JSON.stringify(label)})).getAttribute('aria-pressed') === '${wanted}'`, { what: `${label} set` });
  }
}

test('several uploads are selected with their boxes, a range with shift, and deleted at once', { skip }, async (t) => {
  await api('/api/user/files/folder', { as: 'carol', json: { name: 'Mass edit' } });
  t.after(() => api(`/api/user/files?path=${encodeURIComponent('Mass edit')}`, { as: 'carol', method: 'DELETE' }));
  const target = path.join(APP, 'public/user/carol/imported/Mass edit');
  for (let n = 1; n <= 6; n++) {
    fs.writeFileSync(path.join(target, `item-${n}.txt`), 'x'.repeat(1000));
  }
  await page.goto('/my-library?tab=uploads&path=Mass%20edit', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file').length === 6`, { what: 'the files' });
  // A press then a click, as a mouse does
  const box = (n, shiftKey = false) => page.eval(`(() => {
    const input = document.querySelectorAll('app-uploads-browser .file .file-check input')[${n}];
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: ${shiftKey} }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: ${shiftKey} }));
  })()`);
  const barText = () => page.eval(`document.querySelector('app-uploads-browser .selection-bar').textContent.replace(/\\s+/g, ' ').trim()`);

  // The second, then the fifth with shift: the four between them
  await box(1);
  await page.waitFor(`document.querySelector('app-uploads-browser .selection-bar.active')`, { what: 'the selection bar' });
  await box(4, true);
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file.selected').length === 4`, { what: 'the range' });
  assert.match(await barText(), /4 files selected · 3\.9 KB/);

  // Deleted after the confirmation
  await page.eval(`window.confirm = (text) => { window.lastConfirm = text; return true; }`);
  await page.eval(`document.querySelector('app-uploads-browser .delete-selected').click()`);
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file').length === 2`, { what: 'the files left' });
  assert.equal(await page.eval(`window.lastConfirm`), 'Delete 4 files? This cannot be undone.');
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('app-uploads-browser .file-name')].map((n) => n.textContent.trim())`), ['item-1.txt', 'item-6.txt']);
  assert.deepEqual(fs.readdirSync(target).sort(), ['item-1.txt', 'item-6.txt']);
  assert.ok(!(await page.eval(`!!document.querySelector('app-uploads-browser .selection-bar.active')`)), 'the selection is cleared');

  // The header box: all of the page, then none
  await page.eval(`document.querySelector('app-uploads-browser .select-all input').click()`);
  await page.waitFor(`document.querySelectorAll('app-uploads-browser .file.selected').length === 2`, { what: 'all selected' });
  await page.eval(`[...document.querySelectorAll('app-uploads-browser .selection-actions button')].find((b) => b.textContent.includes('Clear')).click()`);
  await page.waitFor(`!document.querySelector('app-uploads-browser .file.selected')`, { what: 'the selection cleared' });
});

test('the seek bar shows the waveform, the row playing an equalizer; each one chosen apart from the movement', { skip }, async (t) => {
  t.after(async () => {
    await appearance(MOVEMENT, 'Subtle');
    await waveformPlaces({ bar: true, full: true });
  });
  const playing = async () => {
    await page.goto('/album/Lyric%20Band/Songs', await login('carol'));
    await page.waitFor(`document.querySelectorAll('app-track-list tbody tr').length === 3`, { what: 'the tracks' });
    await playRow('No lyrics song');
    await page.waitFor(`document.querySelector('app-player-bar .now-playing')`, { what: 'the player' });
  };

  await playing();
  await page.waitFor(`document.querySelector('app-player-bar app-waveform-seek[role="slider"]')?.getAttribute('aria-valuemax') === '20'`, { what: 'the waveform seek bar' });
  assert.ok(await page.eval(`!!document.querySelector('app-track-list tr.current app-equalizer canvas')`), 'the equalizer of the row playing');
  // Both are drawn: some pixels of their canvas are painted
  const painted = (selector) => `(() => { const c = document.querySelector('${selector}'); const d = c && c.width && c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return !!d && d.some((v, i) => i % 4 === 3 && v > 0); })()`;
  await page.waitFor(painted('app-player-bar app-waveform-seek canvas'), { what: 'the bars of the waveform' });
  await page.waitFor(painted('app-track-list tr.current app-equalizer canvas'), { what: 'the bars of the equalizer' });

  // The keyboard moves 5 seconds forward
  const before = Number(await page.eval(`document.querySelector('app-player-bar app-waveform-seek').getAttribute('aria-valuenow')`));
  await page.eval(`document.querySelector('app-player-bar app-waveform-seek').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
  await page.waitFor(`Number(document.querySelector('app-player-bar app-waveform-seek').getAttribute('aria-valuenow')) >= ${before + 4}`, { what: 'the seek by the keyboard' });

  // The visualizers moving, without the waveform: the plain slider, the equalizer still there
  await waveformPlaces({ bar: false, full: false });
  assert.ok(await page.eval(`!!document.querySelector('.visualizers .plain-slider') && !document.querySelector('.visualizers app-waveform-seek')`), 'the preview shows the plain slider');
  await playing();
  await page.waitFor(`document.querySelector('app-player-bar .seek mat-slider') && !document.querySelector('app-player-bar app-waveform-seek')`, { what: 'the plain slider' });
  await page.waitFor(painted('app-track-list tr.current app-equalizer canvas'), { what: 'the equalizer without the waveform' });

  // In the full-screen player only: the plain slider in the bar, the waveform once opened
  await waveformPlaces({ bar: false, full: true });
  await playing();
  await page.waitFor(`document.querySelector('app-player-bar .seek mat-slider') && !document.querySelector('app-player-bar app-waveform-seek')`, { what: 'the plain slider in the bar' });
  await page.eval(`document.querySelector('app-player-bar .now-playing').click()`);
  await page.waitFor(painted('app-player-bar .sheet app-waveform-seek canvas'), { what: 'the waveform of the full-screen player' });

  // The waveform without movement: shown, standing still
  await waveformPlaces({ bar: true, full: true });
  await appearance(MOVEMENT, 'Off');
  await playing();
  await page.waitFor(painted('app-player-bar app-waveform-seek canvas'), { what: 'the still waveform' });
});

test('the full player offers its animations, each one drawn; turned off, only the still disc stays', { skip }, async (t) => {
  t.after(async () => {
    await appearance(MOVEMENT, 'Subtle');
    await appearance(PLAYER_ANIMATION, 'Breathing cover');
  });
  const painted = (selector) => `(() => { const c = document.querySelector('${selector}'); const d = c && c.width > 1 && c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return !!d && d.some((v, i) => i % 4 === 3 && v > 0); })()`;
  const open = async () => {
    await page.goto('/album/Lyric%20Band/Songs', await login('carol'));
    await page.waitFor(`document.querySelectorAll('app-track-list tbody tr').length === 3`, { what: 'the tracks' });
    await playRow('No lyrics song');
    await page.waitFor(`document.querySelector('app-player-bar .now-playing')`, { what: 'the player' });
    await page.eval(`document.querySelector('app-player-bar .now-playing').click()`);
    await page.waitFor(`document.querySelector('app-player-bar .sheet .animation-picker')`, { what: 'the full player' });
  };
  const pick = async (label) => {
    await page.eval(`document.querySelector('app-player-bar .sheet .animation-picker').click()`);
    await page.waitFor(`[...document.querySelectorAll('.animation-menu [role="menuitemradio"]')].some((item) => item.textContent.includes(${JSON.stringify(label)}))`, { what: 'the animation menu' });
    await page.eval(`[...document.querySelectorAll('.animation-menu [role="menuitemradio"]')].find((item) => item.textContent.includes(${JSON.stringify(label)})).click()`);
  };

  await open();
  for (const [label, selector] of [['Breathing cover', 'app-cover-glow'], ['Spectrum', 'app-spectrum'], ['Ambient backdrop', 'app-ambient-backdrop'], ['Spinning disc', 'app-spinning-disc']]) {
    await pick(label);
    await page.waitFor(painted(`app-player-bar .sheet ${selector} canvas`), { what: `the ${label} drawn` });
  }
  assert.ok(await page.eval(`!!document.querySelector('app-player-bar .sheet app-spinning-disc .disc')`), 'the disc holds the cover');
  await pick('Cover only');
  await page.waitFor(`!document.querySelector('app-player-bar .sheet app-spinning-disc, app-player-bar .sheet app-cover-glow') && document.querySelector('app-player-bar .sheet .sheet-cover')`, { what: 'the cover alone' });

  // The choice is a setting: Appearance shows it, and the visualizers turned off keep the disc only
  await appearance(PLAYER_ANIMATION, 'Ambient backdrop');
  await appearance(MOVEMENT, 'Off');
  await open();
  assert.ok(!(await page.eval(`!!document.querySelector('app-player-bar .sheet app-ambient-backdrop')`)), 'no backdrop with the visualizers off');
  await pick('Spinning disc');
  await page.waitFor(painted('app-player-bar .sheet app-spinning-disc canvas'), { what: 'the still disc and its progress ring' });
});

test('the Videos page lists the videos by folder; one plays, stopping the music, then the next one', { skip }, async () => {
  // Music first: a video that plays pauses it
  await page.goto('/album/Lyric%20Band/Songs', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-track-list tbody tr').length === 3`, { what: 'the tracks' });
  await playRow('No lyrics song');
  await page.waitFor(`navigator.mediaSession.playbackState === 'playing'`, { what: 'the music playing' });

  // From the menu, without leaving the application
  await page.eval(`document.querySelector('a[href="/videos"]').click()`);
  await page.waitFor(`document.querySelectorAll('app-videos-page .video-card').length === 3`, { what: 'the three videos' });
  const sections = await page.eval(`[...document.querySelectorAll('app-videos-page .section')].map((s) => s.querySelector('.folder-name').textContent.trim() + ':' + s.querySelectorAll('.video-card').length)`);
  assert.deepEqual(sections, ['Videos:1', 'Holidays:2']);
  await page.waitFor(`[...document.querySelectorAll('app-videos-page .poster img')].some((img) => img.complete && img.naturalWidth > 0)`, { what: 'a poster' });
  assert.ok(await page.eval(`[...document.querySelectorAll('app-videos-page .video-card')].find((c) => c.textContent.includes('Old clip')).textContent.includes('Download only')`), 'the MPEG-1 is marked');

  // Search
  await page.eval(`(() => { const input = document.querySelector('app-videos-page .search input'); input.value = 'beach'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.waitFor(`document.querySelectorAll('app-videos-page .video-card').length === 1`, { what: 'the search' });

  // It plays, and the music stops
  await page.eval(`document.querySelector('app-videos-page .video-card').click()`);
  await page.waitFor(`document.querySelector('app-video-page h1')?.textContent.trim() === 'Beach day'`, { what: 'the video page' });
  await page.waitFor(`document.querySelector('app-video-page video')?.currentTime > 0.3`, { what: 'the video playing' });
  await page.waitFor(`navigator.mediaSession.playbackState === 'paused'`, { what: 'the music paused' });
  assert.equal(await page.eval(`document.querySelector('app-video-page .siblings .current').textContent.includes('Beach day')`), true);

  // Seeking near the end: the next video of the folder follows
  await page.eval(`(() => { const v = document.querySelector('app-video-page video'); v.currentTime = v.duration - 0.2; })()`);
  await page.waitFor(`document.querySelector('app-video-page h1')?.textContent.trim() === 'Mountain trip'`, { what: 'the next video', timeout: 15000 });
  await page.waitFor(`document.querySelector('app-video-page video')?.currentTime > 0.1`, { what: 'the next video playing' });

  // A format the browsers do not play: a download instead
  await page.eval(`document.querySelector('app-video-page .back').click()`);
  await page.waitFor(`document.querySelectorAll('app-videos-page .video-card').length === 3`, { what: 'the list again' });
  await page.eval(`[...document.querySelectorAll('app-videos-page .video-card')].find((c) => c.textContent.includes('Old clip')).click()`);
  await page.waitFor(`document.querySelector('app-video-page .unplayable a[download]')`, { what: 'the download of the MPEG-1' });
  assert.ok(!(await page.eval(`!!document.querySelector('app-video-page video')`)));
  assert.equal(await page.eval(`document.querySelector('app-video-page .unplayable a[download]').getAttribute('download')`), 'Old clip.mpg');
});

test('an album copied into the music folder shows in the open page, told by a notification', { skip }, async (t) => {
  const folder = path.join(MUSIC, 'Aardvark Watchers/Live Update');
  t.after(async () => {
    fs.rmSync(path.join(MUSIC, 'Aardvark Watchers'), { recursive: true, force: true });
    await eventually(async () => !JSON.stringify((await api('/api/audio/tracks/filter/Aardvark/0', { as: 'carol' })).body).includes('Aardvark'), { timeout: 20000, what: 'the album gone' });
  });
  await page.goto('/', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-discover-page app-artist-card').length > 3`, { what: 'the artists' });
  assert.ok(!(await page.eval(`document.querySelector('app-discover-page').textContent.includes('Aardvark Watchers')`)));

  // Written beside the music folder, then moved in: a whole file
  fs.mkdirSync(folder, { recursive: true });
  const temporary = path.join(path.dirname(MUSIC), 'aardvark.mp3');
  const made = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=2400:duration=2',
    '-metadata', 'artist=Aardvark Watchers', '-metadata', 'album=Live Update', '-metadata', 'title=Seen at once', '-q:a', '9', temporary]);
  assert.equal(made.status, 0, String(made.stderr));
  fs.renameSync(temporary, path.join(folder, '1.mp3'));

  await page.waitFor(`document.querySelector('app-notifications .library-change')?.textContent.includes('1 track added')`, { timeout: 20000, what: 'the notification' });
  assert.ok(await page.eval(`document.querySelector('app-notifications .library-change').textContent.includes('Aardvark Watchers – Live Update')`));
  await page.waitFor(`document.querySelector('app-discover-page').textContent.includes('Aardvark Watchers')`, { what: 'the new artist in the page' });
  assert.equal(await page.eval(`location.pathname`), '/', 'no navigation');
});

test('the Android application is offered from the login page and the account menu', { skip }, async (t) => {
  const dist = path.join(APP, 'android/dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'ongaku.apk'), Buffer.alloc(2048));
  fs.writeFileSync(path.join(dist, 'ongaku.json'), JSON.stringify({ versionName: '1.2.3', versionCode: 7, fingerprints: [] }));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));

  // Before signing in
  await page.goto('/login');
  await page.waitFor(`document.querySelector('app-login .android-link a')`, { what: 'the link of the login page' });
  await page.eval(`document.querySelector('app-login .android-link a').click()`);
  await page.waitFor(`document.querySelector('app-android-page .download-button')`, { what: 'the Android page' });
  assert.equal(await page.eval(`document.querySelector('app-android-page .download-button').getAttribute('href')`), '/download/ongaku.apk');
  assert.match(await page.eval(`document.querySelector('app-android-page .download-text').textContent`), /Version 1\.2\.3 · 2\.0 KB/);
  assert.equal(await page.eval(`document.querySelector('app-android-page .server').textContent.trim()`), await page.eval(`location.origin`));
  // Not an Android phone: no link to the installed application
  assert.ok(!(await page.eval(`!!document.querySelector('app-android-page .connect-app')`)));
  assert.ok(await page.eval(`!!document.querySelector('app-android-page .back')`), 'back to the sign in');

  // Signed in: from the account menu
  await page.goto('/', await login('carol'));
  await page.waitFor(`document.querySelector('app-shell button.avatar')`, { what: 'the account button' });
  await page.eval(`document.querySelector('app-shell button.avatar').click()`);
  await page.waitFor(`[...document.querySelectorAll('.mat-mdc-menu-panel a')].some((a) => a.textContent.includes('Android app'))`, { what: 'the menu entry' });
  await page.eval(`[...document.querySelectorAll('.mat-mdc-menu-panel a')].find((a) => a.textContent.includes('Android app')).click()`);
  await page.waitFor(`document.querySelector('app-android-page .download-button')`, { what: 'the Android page signed in' });
  assert.ok(!(await page.eval(`!!document.querySelector('app-android-page .back')`)), 'no link to the sign in');
});

test('the Images page shows my uploaded images only, opens them in a viewer, adds and deletes them', { skip }, async (t) => {
  const clear = async (as) => {
    const { body } = await api('/api/user/files', { as });
    for (const file of body.files ?? []) {
      await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as, method: 'DELETE' });
    }
  };
  t.after(async () => {
    await clear('carol');
    await clear('alice');
  });
  await api('/api/user/files/upload', { as: 'carol', form: fileForm('photo.jpg') });
  await api('/api/user/files/upload', { as: 'carol', form: fileForm('photos.zip') });
  // Another member's image: never on carol's page
  await api('/api/user/files/upload', { as: 'alice', form: fileForm('tiny.png') });

  await page.goto('/images', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-images-page .tile').length === 2`, { what: 'the two images' });
  await page.waitFor(`[...document.querySelectorAll('app-images-page .tile img')].every((img) => img.complete && img.naturalWidth > 0)`, { what: 'the thumbnails' });
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('app-images-page .folders mat-chip-option')].map((c) => c.textContent.trim())`), ['All', 'Uploads', 'Holiday']);

  // The viewer: the original, the keyboard, Escape
  await page.eval(`document.querySelector('app-images-page .tile').click()`);
  await page.waitFor(`document.querySelector('app-images-page .viewer .full.ready')?.naturalWidth > 0`, { what: 'the original in the viewer' });
  const first = await page.eval(`document.querySelector('app-images-page .viewer-info strong').textContent.trim()`);
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
  await page.waitFor(`document.querySelector('app-images-page .viewer-info strong').textContent.trim() !== ${JSON.stringify(first)}`, { what: 'the next image' });
  assert.match(await page.eval(`document.querySelector('app-images-page .viewer .counter').textContent`), /2 \/ 2/);
  assert.match(await page.eval(`document.querySelector('app-images-page .viewer .download').getAttribute('href')`), /^\/api\/images\/file\?path=.+&download=1$/);
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await page.waitFor(`!document.querySelector('app-images-page .viewer')`, { what: 'the viewer closed' });

  // Added from the page: into the Images folder of the uploads
  await page.send('DOM.enable');
  const { root } = await page.send('DOM.getDocument').then((answer) => answer.result);
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'app-images-page input[type=file]' }).then((answer) => answer.result);
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path.join(ASSETS, 'tiny.png')] });
  await page.waitFor(`document.querySelectorAll('app-images-page .tile').length === 3`, { timeout: 15000, what: 'the added image' });
  assert.ok(fs.existsSync(path.join(APP, 'public/user/carol/imported/Images/tiny.png')));

  // Deleted from the viewer
  await page.eval(`window.confirm = () => true`);
  await page.eval(`document.querySelector('app-images-page .tile').click()`);
  await page.waitFor(`document.querySelector('app-images-page .viewer')`, { what: 'the viewer' });
  const deleted = await page.eval(`document.querySelector('app-images-page .viewer-info strong').textContent.trim()`);
  await page.eval(`document.querySelector('app-images-page .viewer .delete').click()`);
  await page.waitFor(`document.querySelectorAll('app-images-page .tile').length === 2`, { what: 'the image deleted' });
  assert.notEqual(await page.eval(`document.querySelector('app-images-page .viewer-info strong')?.textContent.trim()`), deleted, 'the viewer goes on with another image');
});

test('several images are selected on the Images page, a range with shift, and deleted at once', { skip }, async (t) => {
  const clear = async () => {
    const { body } = await api('/api/user/files', { as: 'carol' });
    for (const file of body.files ?? []) {
      await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as: 'carol', method: 'DELETE' });
    }
  };
  t.after(clear);
  for (const file of ['photo.jpg', 'tiny.png', 'photos.zip']) {
    await api('/api/user/files/upload', { as: 'carol', form: fileForm(file) });
  }
  await page.goto('/images', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-images-page .tile').length === 3`, { what: 'the three images' });
  const tile = (n, shiftKey = false) => page.eval(`document.querySelectorAll('app-images-page .tile')[${n}].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: ${shiftKey} }))`);
  const barText = () => page.eval(`document.querySelector('app-images-page .selection-text').textContent.replace(/\\s+/g, ' ').trim()`);

  // The check circle of a tile starts the selection, without opening the viewer
  await page.eval(`document.querySelectorAll('app-images-page .tile .check')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await page.waitFor(`document.querySelector('app-images-page .selection-bar')`, { what: 'the selection bar' });
  assert.ok(!(await page.eval(`!!document.querySelector('app-images-page .viewer')`)), 'no viewer');
  assert.match(await barText(), /^1 image selected/);
  // Escape leaves the selection
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await page.waitFor(`!document.querySelector('app-images-page .selection-bar')`, { what: 'the selection left' });

  // From the Select button: the first, then the third with shift
  await page.eval(`document.querySelector('app-images-page .select').click()`);
  await page.waitFor(`document.querySelector('app-images-page .selection-bar')`, { what: 'the selection mode' });
  assert.match(await barText(), /Tap images to select them/);
  await tile(0);
  await tile(2, true);
  await page.waitFor(`document.querySelectorAll('app-images-page .tile.checked').length === 3`, { what: 'the range' });
  assert.match(await barText(), /^3 images selected · /);
  await page.eval(`document.querySelector('app-images-page .select-all').click()`);
  await page.waitFor(`!document.querySelector('app-images-page .tile.checked')`, { what: 'select none' });
  await tile(0);
  await tile(1);
  await page.waitFor(`document.querySelectorAll('app-images-page .tile.checked').length === 2`, { what: 'two images' });
  const kept = await page.eval(`document.querySelectorAll('app-images-page .tile')[2].getAttribute('aria-label')`);

  await page.eval(`window.confirm = (text) => { window.lastConfirm = text; return true; }`);
  await page.eval(`document.querySelector('app-images-page .delete-selected').click()`);
  await page.waitFor(`document.querySelectorAll('app-images-page .tile').length === 1`, { what: 'the images deleted' });
  assert.equal(await page.eval(`window.lastConfirm`), 'Delete 2 images? This cannot be undone.');
  assert.ok(!(await page.eval(`!!document.querySelector('app-images-page .selection-bar')`)), 'the selection mode ends');
  assert.equal(await page.eval(`document.querySelector('app-images-page .tile').getAttribute('aria-label')`), kept.replace('Select ', 'Open '));
  assert.equal((await api('/api/images', { as: 'carol' })).body.images.length, 1);
});

test('selected images are shared by a public link, opened without an account, then revoked', { skip }, async (t) => {
  const clear = async () => {
    for (const share of (await api('/api/shares', { as: 'carol' })).body.shares ?? []) {
      await api(`/api/shares/${share.token}`, { as: 'carol', method: 'DELETE' });
    }
    const { body } = await api('/api/user/files', { as: 'carol' });
    for (const file of body.files ?? []) {
      await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as: 'carol', method: 'DELETE' });
    }
  };
  t.after(clear);
  await api('/api/user/files/upload', { as: 'carol', form: fileForm('photo.jpg') });
  await api('/api/user/files/upload', { as: 'carol', form: fileForm('photos.zip') });

  await page.goto('/images', await login('carol'));
  await page.waitFor(`document.querySelectorAll('app-images-page .tile').length === 2`, { what: 'the images' });
  await page.eval(`document.querySelector('app-images-page .select').click()`);
  for (const n of [0, 1]) {
    await page.eval(`document.querySelectorAll('app-images-page .tile')[${n}].click()`);
  }
  await page.waitFor(`document.querySelectorAll('app-images-page .tile.checked').length === 2`, { what: 'two images selected' });
  await page.eval(`document.querySelector('app-images-page .share-selected').click()`);
  await page.waitFor(`document.querySelector('app-share-dialog input[matinput]')`, { what: 'the share dialog' });
  assert.equal(await page.eval(`document.querySelector('app-share-dialog input[matinput]').value`), '2 images', 'a title suggested');
  await page.eval(`(() => { const input = document.querySelector('app-share-dialog input[matinput]'); input.value = 'For the family'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.eval(`document.querySelector('app-share-dialog .create').click()`);
  await page.waitFor(`document.querySelector('app-share-dialog input.link')?.value.includes('/s/')`, { what: 'the link' });
  const link = new URL(await page.eval(`document.querySelector('app-share-dialog input.link').value`));
  assert.match(link.pathname, /^\/s\/[A-Za-z0-9_-]{22}$/);
  await page.eval(`[...document.querySelectorAll('app-share-dialog button')].find((b) => b.textContent.includes('Done')).click()`);
  await page.waitFor(`!document.querySelector('app-share-dialog') && !document.querySelector('app-images-page .selection-bar')`, { what: 'the selection done' });

  // Without an account
  await page.goto(link.pathname);
  await page.waitFor(`document.querySelector('app-share-page h1')?.textContent.trim() === 'For the family'`, { what: 'the shared page' });
  assert.match(await page.eval(`document.querySelector('app-share-page .intro p').textContent`), /Shared by carol · 2 images/);
  await page.waitFor(`document.querySelectorAll('app-share-page .tile img').length === 2 && [...document.querySelectorAll('app-share-page .tile img')].every((img) => img.complete && img.naturalWidth > 0)`, { what: 'the thumbnails' });
  assert.ok(!(await page.eval(`!!document.querySelector('app-shell')`)), 'no application around');
  await page.eval(`document.querySelector('app-share-page .tile').click()`);
  await page.waitFor(`document.querySelector('app-share-page .viewer .full.ready')?.naturalWidth > 0`, { what: 'the image in the viewer' });
  assert.ok(!(await page.eval(`!!document.querySelector('app-share-page .viewer .delete')`)), 'no delete for visitors');
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
  await page.waitFor(`/2 \\/ 2/.test(document.querySelector('app-share-page .viewer .counter').textContent)`, { what: 'the next image' });

  // The owner sees it among her links, opened once, and revokes it
  await page.goto('/images', await login('carol'));
  await page.waitFor(`document.querySelector('app-images-page .shares')`, { what: 'the Shared links button' });
  await page.eval(`document.querySelector('app-images-page .shares').click()`);
  await page.waitFor(`document.querySelector('app-shares-dialog .share')`, { what: 'the links' });
  assert.match(await page.eval(`document.querySelector('app-shares-dialog .share').textContent.replace(/\\s+/g, ' ')`), /For the family 2 images · 1 view/);
  await page.eval(`window.confirm = () => true`);
  await page.eval(`document.querySelector('app-shares-dialog .revoke').click()`);
  await page.waitFor(`!document.querySelector('app-shares-dialog .share')`, { what: 'the link revoked' });

  await page.goto(link.pathname);
  await page.waitFor(`document.querySelector('app-share-page h1')?.textContent.includes('revoked')`, { what: 'the link no longer working' });
});

test('a backup is downloaded and restored from the Backup tab, the data and the music apart', { skip }, async () => {
  await page.goto('/admin', await login('boss'));
  await page.waitFor(`[...document.querySelectorAll('.mdc-tab')].some((tab) => tab.textContent.trim() === 'Backup')`, { what: 'the tabs' });
  await page.eval(`[...document.querySelectorAll('.mdc-tab')].find((tab) => tab.textContent.trim() === 'Backup').click()`);
  await page.waitFor(`document.querySelector('.mat-mdc-tab-body-active a.download-data')`, { what: 'the download links' });
  const links = await page.eval(`['download-data', 'download-music', 'download-all'].map((name) => document.querySelector('.mat-mdc-tab-body-active a.' + name).getAttribute('href'))`);
  assert.deepEqual(links, ['/api/admin/backup?part=data', '/api/admin/backup?part=music', '/api/admin/backup?part=all']);

  /** Fetches a backup in the page and gives it to the file input of the restore */
  const choose = (part, name) => page.eval(`fetch('/api/admin/backup?part=${part}').then((r) => r.blob()).then((blob) => {
    const input = document.querySelector('.mat-mdc-tab-body-active input[type=file]');
    const files = new DataTransfer();
    files.items.add(new File([blob], '${name}', { type: 'application/x-tar' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })`);

  // A music file: added without a confirmation, it replaces nothing
  await choose('music', 'ongaku-backup-music.tar');
  await page.waitFor(`document.querySelector('.mat-mdc-tab-body-active .restore-holds')?.textContent.includes('the music (1 folder)')`, { what: 'what the music file holds' });
  assert.match(await page.eval(`document.querySelector('.mat-mdc-tab-body-active .restore-button').textContent.trim()`), /Add this music$/);
  assert.equal(await page.eval(`!!document.querySelector('.mat-mdc-tab-body-active .restore-confirm')`), false);

  // A data file: confirmed, then restored
  await choose('data', 'ongaku-backup-data.tar');
  await page.waitFor(`document.querySelector('.mat-mdc-tab-body-active .restore-holds')?.textContent.includes('the data (')`, { what: 'what the data file holds' });
  await page.eval(`document.querySelector('.mat-mdc-tab-body-active .restore-confirm input').click()`);
  await page.eval(`document.querySelector('.mat-mdc-tab-body-active .restore-button').click()`);
  await page.waitFor(`document.querySelector('.mat-mdc-tab-body-active .notice.ok')?.textContent.includes('Data restored')`, { what: 'the restore report', timeout: 30000 });
  await eventually(async () => {
    const health = await api('/api/admin/library/health', { as: 'boss' });
    const tracks = await api('/api/audio/tracks/filter/Sidecar/0', { as: 'boss' });
    return !health.body.scanning && Array.isArray(tracks.body) && tracks.body.length > 0;
  }, { timeout: 30000, what: 'the library after the restore' });
});

test('no uncaught error in the pages', { skip }, () => {
  assert.deepEqual(page.errors, []);
});
