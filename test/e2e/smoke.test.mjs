import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { login } from '../helpers/client.mjs';
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

test('the Health tab of the administration renders', { skip }, async () => {
  await page.goto('/admin', await login('boss'));
  await page.waitFor(`[...document.querySelectorAll('.mdc-tab')].some((tab) => tab.textContent.includes('Health'))`, { what: 'the tabs' });
  await page.eval(`[...document.querySelectorAll('.mdc-tab')].find((tab) => tab.textContent.includes('Health')).click()`);
  await page.waitFor(`document.querySelectorAll('.mat-mdc-tab-body-active .tile').length === 4`, { what: 'the health tiles' });
  const sections = await page.eval(`[...document.querySelectorAll('.mat-mdc-tab-body-active section h2')].map((h) => h.textContent.trim())`);
  assert.deepEqual(sections, ['Albums without cover', 'Tracks with missing tags', 'Duplicates', 'Unreadable files']);
});

test('no uncaught error in the pages', { skip }, () => {
  assert.deepEqual(page.errors, []);
});
