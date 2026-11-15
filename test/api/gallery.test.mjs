import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { APP, ASSETS, BASE, api, fileForm, login } from '../helpers/client.mjs';

const upload = (as, file, folder = '') => api(`/api/user/files/upload${folder ? `?path=${encodeURIComponent(folder)}` : ''}`, { as, form: fileForm(file) });
const removeUploads = async (as) => {
  const { body } = await api('/api/user/files', { as });
  for (const file of body.files ?? []) {
    await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as, method: 'DELETE' });
  }
};
const images = async (as) => {
  const { status, body } = await api('/api/images', { as });
  assert.equal(status, 200, JSON.stringify(body));
  return body.images;
};
const get = async (url, as) => fetch(`${BASE}${url}`, { headers: as ? { Cookie: await login(as) } : {} });

/** Width and height of an image, read by ffprobe */
function dimensions(buffer) {
  const file = path.join(os.tmpdir(), `ongaku-thumb-${process.pid}.jpg`);
  fs.writeFileSync(file, buffer);
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  fs.rmSync(file, { force: true });
  return result.stdout.trim().split(',').map(Number);
}

test('uploaded images are listed for their owner only, the latest first, archives included', async (t) => {
  t.after(() => removeUploads('alice'));
  assert.deepEqual((await upload('alice', 'photo.jpg')).body.files, [{ file: 'photo.jpg', imported: ['photo.jpg'] }]);
  assert.deepEqual((await upload('alice', 'tiny.png')).body.files, [{ file: 'tiny.png', imported: ['tiny.png'] }]);
  assert.deepEqual((await upload('alice', 'photos.zip')).body.files, [{ file: 'photos.zip', imported: ['Holiday/beach.jpg'] }], 'the text file left out');
  // SVG may hold scripts: refused
  assert.equal((await upload('alice', 'drawing.svg')).body.files[0].error, 'Unsupported file type');

  const mine = await images('alice');
  assert.deepEqual(mine.map((image) => image.path).sort(), ['Holiday/beach.jpg', 'photo.jpg', 'tiny.png']);
  const beach = mine.find((image) => image.name === 'beach.jpg');
  assert.equal(beach.folder, 'Holiday');
  assert.equal(beach.size, fs.statSync(path.join(ASSETS, 'photos/Holiday/beach.jpg')).size);
  assert.ok(mine.every((image, i) => i === 0 || mine[i - 1].modified >= image.modified), 'the latest first');
  assert.equal(mine.find((image) => image.name === 'photo.jpg').folder, '');

  // Nobody else: neither another member nor an administrator
  assert.deepEqual(await images('carol'), []);
  assert.ok(!(await images('boss')).some((image) => image.name === 'photo.jpg'));
  // The uploads listing tells images apart
  assert.equal((await api('/api/user/files', { as: 'alice' })).body.files.find((file) => file.name === 'photo.jpg').image, true);
});

test('an image and its thumbnails are served to their owner only, privately', async (t) => {
  t.after(() => removeUploads('alice'));
  await upload('alice', 'photo.jpg');
  await upload('alice', 'tiny.png');

  const original = await get('/api/images/file?path=photo.jpg', 'alice');
  assert.equal(original.status, 200);
  assert.equal(original.headers.get('content-type'), 'image/jpeg');
  assert.equal(original.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(original.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), fs.readFileSync(path.join(ASSETS, 'photo.jpg')));
  const download = await get('/api/images/file?path=photo.jpg&download=1', 'alice');
  assert.match(download.headers.get('content-disposition'), /attachment; filename="?photo\.jpg"?/);

  const thumb = await get('/api/images/thumb?path=photo.jpg&size=320', 'alice');
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(dimensions(Buffer.from(await thumb.arrayBuffer())), [320, 240], 'within 320, the shape kept');
  const large = await get('/api/images/thumb?path=photo.jpg&size=640', 'alice');
  assert.deepEqual(dimensions(Buffer.from(await large.arrayBuffer())), [640, 480]);
  const small = await get('/api/images/thumb?path=tiny.png&size=320', 'alice');
  assert.deepEqual(dimensions(Buffer.from(await small.arrayBuffer())), [64, 48], 'never larger than the image');
  // Made once, outside the served files
  const cache = path.join(APP, 'public/.cache/thumbs');
  const count = fs.readdirSync(cache).length;
  assert.equal((await get('/api/images/thumb?path=photo.jpg&size=320', 'alice')).status, 200);
  assert.equal(fs.readdirSync(cache).length, count, 'from the cache');
  assert.equal((await get('/api/images/thumb?path=photo.jpg&size=999', 'alice')).status, 400);

  // Another member asks for the same path: his own uploads, where it is not
  assert.equal((await get('/api/images/file?path=photo.jpg', 'carol')).status, 404);
  assert.equal((await get('/api/images/thumb?path=photo.jpg&size=320', 'carol')).status, 404);
  for (const bad of ['../../alice/imported/photo.jpg', '../alice/imported/photo.jpg', '/etc/passwd', '']) {
    assert.equal((await get(`/api/images/file?path=${encodeURIComponent(bad)}`, 'carol')).status, 400, bad);
  }
  // Not an image
  assert.equal((await get('/api/images/file?path=notes.txt', 'alice')).status, 400);
  // No session
  for (const url of ['/api/images', '/api/images/file?path=photo.jpg', '/api/images/thumb?path=photo.jpg&size=320']) {
    assert.equal((await get(url)).status, 401, url);
  }
});

test('the folders of the members are not served as static files, but their profile images', async (t) => {
  t.after(async () => {
    await removeUploads('alice');
    for (const type of ['avatar', 'background']) {
      await api(`/api/user/image/${type}`, { as: 'alice', method: 'DELETE' });
    }
  });
  await upload('alice', 'photo.jpg');
  assert.equal((await api('/api/user/image/avatar', { as: 'alice', form: fileForm('tiny.png', 'file', 'image/png') })).status, 200);
  assert.equal((await api('/api/user/image/background', { as: 'alice', form: fileForm('tiny.png', 'file', 'image/png') })).status, 200);

  // Uploads and the background: never, not even signed in
  for (const url of ['/static/user/alice/imported/photo.jpg', '/static/user/alice/background', '/static/user/alice/imported/', '/static/user/alice/']) {
    assert.equal((await get(url)).status, 404, url);
    assert.equal((await get(url, 'carol')).status, 404, `${url} for another member`);
  }
  // The profile pictures stay public (shown on the members list)
  assert.equal((await get('/static/user/alice/avatar')).status, 200);
  assert.equal((await get('/static/img/album.png')).status, 200);
});
