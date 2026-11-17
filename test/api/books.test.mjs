import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { APP, BASE, MUSIC, api, eventually, fileForm, login, track } from '../helpers/client.mjs';

/** poppler-utils: the title, the pages and the cover of a PDF need it */
const POPPLER = spawnSync('pdfinfo', ['-v'], { stdio: 'ignore' }).status === 0 && spawnSync('pdftoppm', ['-v'], { stdio: 'ignore' }).status === 0;

async function books(as = 'carol', query = '') {
  const { status, body } = await api(`/api/books${query ? `?q=${encodeURIComponent(query)}` : ''}`, { as });
  assert.equal(status, 200, JSON.stringify(body));
  return body.books;
}

async function bookNamed(name, as = 'carol') {
  const found = (await books(as)).find((book) => book.name === name);
  assert.ok(found, `the book "${name}"`);
  return found;
}

async function removeUploads(as) {
  const { body } = await api('/api/user/files', { as });
  for (const file of body.files ?? []) {
    await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as, method: 'DELETE' });
  }
}

test('the books of the library are listed with their details, never their path', async () => {
  const list = await books();
  assert.deepEqual(list.map((book) => book.name).sort(), ['Field_notes.pdf', 'manual.pdf', 'time_machine.epub']);

  const novel = list.find((book) => book.name === 'time_machine.epub');
  assert.equal(novel.title, 'The Time Machine', 'from the package document of the EPUB');
  assert.equal(novel.author, 'H. G. Wells & Co', 'entities decoded');
  assert.equal(novel.format, 'epub');
  assert.equal(novel.folder, 'Books/Novels');
  assert.equal(novel.private, false);
  assert.equal(novel.progress, null);
  assert.equal(novel.size, fs.statSync(path.join(MUSIC, 'Books/Novels/time_machine.epub')).size);

  const notes = list.find((book) => book.name === 'Field_notes.pdf');
  assert.equal(notes.title, 'Field notes', 'no tags: from the name of the file');
  assert.equal(notes.format, 'pdf');
  if (POPPLER) {
    const manual = list.find((book) => book.name === 'manual.pdf');
    assert.equal(manual.title, 'Ongaku Manual');
    assert.equal(manual.author, 'Test Author');
    assert.equal(manual.pages, 3);
    assert.equal(notes.pages, 2);
  }
  assert.ok(list.every((book) => !('file' in book)), 'no path on the server');
  assert.ok(!JSON.stringify(list).includes(path.sep + 'Books' + path.sep));
});

test('the books are searched, and are not among the tracks', async () => {
  assert.deepEqual((await books('carol', 'time machine')).map((book) => book.name), ['time_machine.epub']);
  assert.deepEqual((await books('carol', 'wells')).map((book) => book.name), ['time_machine.epub'], 'by author');
  assert.deepEqual((await books('carol', 'novels')).map((book) => book.name), ['time_machine.epub'], 'by folder');
  assert.deepEqual(await books('carol', 'nothing like this'), []);
  assert.equal(await track('The Time Machine'), undefined);
  const novel = await bookNamed('time_machine.epub');
  assert.equal((await api(`/api/audio/stream/${novel.uid}`, { as: 'carol' })).status, 404);
});

test('a book is sent by ranges, for the reader only', async () => {
  const manual = await bookNamed('manual.pdf');
  const cookie = await login('carol');
  const whole = await fetch(`${BASE}/api/books/${manual.uid}/file`, { headers: { Cookie: cookie } });
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'application/pdf');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal(whole.headers.get('x-content-type-options'), 'nosniff');
  assert.match(whole.headers.get('content-security-policy'), /sandbox/, 'never a page of the application');
  assert.equal(whole.headers.get('content-disposition'), null);
  const bytes = Buffer.from(await whole.arrayBuffer());
  assert.equal(bytes.length, manual.size);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');

  const part = await fetch(`${BASE}/api/books/${manual.uid}/file`, { headers: { Cookie: cookie, Range: 'bytes=10-59' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 10-59/${manual.size}`);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(10, 60));

  const novel = await bookNamed('time_machine.epub');
  const download = await fetch(`${BASE}/api/books/${novel.uid}/file?download=1`, { headers: { Cookie: cookie } });
  assert.equal(download.headers.get('content-type'), 'application/epub+zip');
  assert.match(download.headers.get('content-disposition'), /attachment; filename="?time_machine\.epub"?/);
  assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 2).toString(), 'PK');
});

test('the cover of a book is made once and kept outside the served files', async () => {
  const novel = await bookNamed('time_machine.epub');
  const cookie = await login('carol');
  const first = await fetch(`${BASE}/api/books/${novel.uid}/cover`, { headers: { Cookie: cookie } });
  assert.equal(first.status, 200, 'the cover image of the EPUB');
  assert.match(first.headers.get('content-type'), /^image\/jpeg/);
  assert.deepEqual([...Buffer.from(await first.arrayBuffer()).subarray(0, 3)], [0xff, 0xd8, 0xff], 'a JPEG');

  const cache = path.join(APP, 'public/.cache/book-covers');
  const cached = fs.readdirSync(cache).filter((file) => file.startsWith(novel.uid));
  assert.equal(cached.length, 1);
  assert.equal((await fetch(`${BASE}/api/books/${novel.uid}/cover`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal(fs.readdirSync(cache).filter((file) => file.startsWith(novel.uid)).length, 1, 'not made again');
  const leaked = await fetch(`${BASE}/static/.cache/book-covers/${cached[0]}`, { headers: { Cookie: cookie } });
  assert.notEqual(leaked.headers.get('content-type'), 'image/jpeg');

  // A PDF: its first page with poppler-utils, none without
  const manual = await bookNamed('manual.pdf');
  const page = await fetch(`${BASE}/api/books/${manual.uid}/cover`, { headers: { Cookie: cookie } });
  assert.equal(page.status, POPPLER ? 200 : 422);
  if (POPPLER) {
    assert.deepEqual([...Buffer.from(await page.arrayBuffer()).subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
});

test('the books need a session and a known uid', async () => {
  const novel = await bookNamed('time_machine.epub');
  for (const url of ['/api/books', `/api/books/${novel.uid}`, `/api/books/${novel.uid}/file`, `/api/books/${novel.uid}/cover`]) {
    assert.equal((await api(url)).status, 401, url);
  }
  assert.equal((await api(`/api/books/${novel.uid}/progress`, { method: 'PUT', json: { position: '1', percent: 0.5 } })).status, 401);
  assert.equal((await api(`/api/books/${novel.uid}`, { as: 'carol' })).body.title, 'The Time Machine');
  for (const url of ['/api/books/unknown', '/api/books/unknown/file', '/api/books/unknown/cover', '/api/books/..%2F..%2Fetc/file']) {
    assert.equal((await api(url, { as: 'carol' })).status, 404, url);
  }
  assert.equal((await api('/api/books/unknown/progress', { as: 'carol', method: 'PUT', json: { position: '1', percent: 0.5 } })).status, 404);
});

test('each member finds the page he was reading again', async (t) => {
  const manual = await bookNamed('manual.pdf');
  const url = `/api/books/${manual.uid}/progress`;
  t.after(() => api(url, { as: 'carol', method: 'DELETE' }));

  for (const json of [{}, { position: '2' }, { position: '', percent: 0.5 }, { position: 2, percent: 0.5 }, { position: '2', percent: 1.5 },
    { position: '2', percent: '0.5' }, { position: 'x'.repeat(2001), percent: 0.5 }]) {
    assert.equal((await api(url, { as: 'carol', method: 'PUT', json })).status, 400, JSON.stringify(json).slice(0, 60));
  }
  const before = Date.now();
  const saved = await api(url, { as: 'carol', method: 'PUT', json: { position: '2', percent: 0.66666 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.position, '2');
  assert.equal(saved.body.percent, 0.6667);
  assert.ok(saved.body.updated >= before);

  assert.deepEqual((await bookNamed('manual.pdf')).progress, saved.body);
  assert.deepEqual((await api(`/api/books/${manual.uid}`, { as: 'carol' })).body.progress, saved.body);
  assert.equal((await bookNamed('manual.pdf', 'alice')).progress, null, 'his own only');

  assert.equal((await api(url, { as: 'carol', method: 'DELETE' })).status, 200);
  assert.equal((await bookNamed('manual.pdf')).progress, null);
});

test('books are uploaded, alone or in an archive, and only their owner reads them', async (t) => {
  t.after(() => removeUploads('alice'));

  const single = await api('/api/user/files/upload', { as: 'alice', form: fileForm('pocket guide.pdf') });
  assert.equal(single.status, 200, JSON.stringify(single.body));
  assert.deepEqual(single.body.files, [{ file: 'pocket guide.pdf', imported: ['pocket guide.pdf'] }]);
  const archive = await api('/api/user/files/upload', { as: 'alice', form: fileForm('ebooks.zip') });
  assert.deepEqual(archive.body.files, [{ file: 'ebooks.zip', imported: ['Shelf/story.epub'] }]);

  const guide = await bookNamed('pocket guide.pdf', 'alice');
  const story = await bookNamed('story.epub', 'alice');
  assert.equal(guide.folder, 'My uploads');
  assert.equal(guide.private, true);
  assert.equal(story.folder, 'My uploads/Shelf');
  assert.equal(story.title, 'A Short Story');
  assert.equal(story.author, 'Alice');
  const cookie = await login('alice');
  assert.equal((await fetch(`${BASE}/api/books/${story.uid}/file`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${BASE}/api/books/${story.uid}/cover`, { headers: { Cookie: cookie } })).status, 422, 'an EPUB without cover image');

  // The listing of the uploads tells them apart
  const listing = await api('/api/user/files', { as: 'alice' });
  assert.equal(listing.body.files.find((file) => file.name === 'pocket guide.pdf').book, true);

  // Nobody else sees them, nor gets them
  assert.ok(!(await books('carol')).some((book) => book.uid === guide.uid || book.uid === story.uid));
  for (const end of ['', '/file', '/cover']) {
    assert.equal((await api(`/api/books/${story.uid}${end}`, { as: 'carol' })).status, 404, end);
  }
  assert.equal((await api(`/api/books/${story.uid}/progress`, { as: 'carol', method: 'PUT', json: { position: 'x', percent: 0.1 } })).status, 404);

  // Renamed: the page reached follows the book
  await api(`/api/books/${guide.uid}/progress`, { as: 'alice', method: 'PUT', json: { position: '2', percent: 1 } });
  const renamed = await api('/api/user/files/rename', { as: 'alice', json: { path: 'pocket guide.pdf', name: 'guide.pdf' } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  const moved = await bookNamed('guide.pdf', 'alice');
  assert.notEqual(moved.uid, guide.uid);
  assert.equal(moved.progress?.position, '2');

  // Deleted: gone from the books
  await api(`/api/user/files?path=${encodeURIComponent('guide.pdf')}`, { as: 'alice', method: 'DELETE' });
  assert.ok(!(await books('alice')).some((book) => book.name === 'guide.pdf'));
});

test('a book put in the music folders shows by itself, and goes with its file', async (t) => {
  const file = path.join(MUSIC, 'Books/Late/arrival.epub');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(MUSIC, 'Books/Novels/time_machine.epub'), file);
  const added = await eventually(async () => (await books()).find((book) => book.name === 'arrival.epub'), { what: 'the new book' });
  assert.equal(added.title, 'The Time Machine');
  assert.equal(added.folder, 'Books/Late');

  fs.rmSync(file);
  await eventually(async () => !(await books()).some((book) => book.name === 'arrival.epub'), { what: 'the book to go' });
});
