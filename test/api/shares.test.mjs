import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { APP, ASSETS, BASE, api, fileForm, login } from '../helpers/client.mjs';

const upload = (as, file) => api('/api/user/files/upload', { as, form: fileForm(file) });
const removeUploads = async (as) => {
  const { body } = await api('/api/user/files', { as });
  for (const file of body.files ?? []) {
    await api(`/api/user/files?path=${encodeURIComponent(file.name)}`, { as, method: 'DELETE' });
  }
};
const removeShares = async (as) => {
  for (const share of (await api('/api/shares', { as })).body.shares ?? []) {
    await api(`/api/shares/${share.token}`, { as, method: 'DELETE' });
  }
};
const share = (as, json) => api('/api/shares', { as, json });

/** The Redis database of the test instance, to make a link expire without waiting */
async function redis(fn) {
  const { createClient } = createRequire(path.join(APP, 'node_modules', 'noop.js'))('redis');
  const client = createClient({
    socket: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) },
    password: process.env.REDIS_PASSWORD || undefined,
    database: Number(process.env.ONGAKU_TEST_REDIS_DB || 14),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.quit();
  }
}

test('a list of images is shared by a link anyone can open, without an account', async (t) => {
  t.after(async () => {
    await removeShares('alice');
    await removeUploads('alice');
  });
  await upload('alice', 'photo.jpg');
  await upload('alice', 'photos.zip');
  await upload('carol', 'tiny.png');
  t.after(() => removeUploads('carol'));

  // Only images of her own uploads: another member's file and a missing one are left out
  const created = await share('alice', { title: '  Holiday  ', paths: ['photo.jpg', 'Holiday/beach.jpg', 'photo.jpg', '../../carol/imported/tiny.png', 'missing.jpg'], expiresInDays: 7 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(created.body.title, 'Holiday');
  assert.equal(created.body.count, 2);
  assert.ok(Math.abs(created.body.expires - (Date.now() + 7 * 86400000)) < 60000);
  const token = created.body.token;

  // Anyone: the title, the owner, the names; never the paths
  const opened = await api(`/api/share/${token}`);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.title, 'Holiday');
  assert.equal(opened.body.owner, 'alice');
  assert.deepEqual(opened.body.images.map((image) => [image.index, image.name]), [[0, 'photo.jpg'], [1, 'beach.jpg']]);
  assert.ok(!JSON.stringify(opened.body).includes('Holiday/'), 'no path');
  assert.equal(opened.headers.get('referrer-policy'), 'no-referrer');

  const original = await fetch(`${BASE}/api/share/${token}/image/0`);
  assert.equal(original.status, 200);
  assert.equal(original.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), fs.readFileSync(path.join(ASSETS, 'photo.jpg')));
  const thumb = await fetch(`${BASE}/api/share/${token}/image/1?size=320`);
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/jpeg');
  assert.match((await fetch(`${BASE}/api/share/${token}/image/0?download=1`)).headers.get('content-disposition'), /attachment/);
  for (const url of [`/api/share/${token}/image/2`, `/api/share/${token}/image/-1`, `/api/share/${token}/image/x`]) {
    assert.equal((await api(url)).status, 404, url);
  }
  assert.equal((await api(`/api/share/${token}/image/0?size=999`)).status, 400);

  // The owner sees her links, with their views; another member does not
  const mine = (await api('/api/shares', { as: 'alice' })).body.shares;
  assert.equal(mine.length, 1);
  assert.deepEqual({ ...mine[0], created: 0, expires: 0 }, { token, title: 'Holiday', count: 2, created: 0, expires: 0, expired: false, views: 1 });
  assert.deepEqual((await api('/api/shares', { as: 'carol' })).body.shares, []);

  // An image deleted from the uploads leaves the link
  await api('/api/user/files/delete', { as: 'alice', json: { paths: ['photo.jpg'] } });
  assert.deepEqual((await api(`/api/share/${token}`)).body.images.map((image) => image.name), ['beach.jpg']);
  assert.equal((await api(`/api/share/${token}/image/0`)).status, 404);

  // Revoked by its owner only
  assert.equal((await api(`/api/shares/${token}`, { as: 'carol', method: 'DELETE' })).status, 404);
  assert.equal((await api(`/api/share/${token}`)).status, 200);
  assert.equal((await api(`/api/shares/${token}`, { as: 'alice', method: 'DELETE' })).status, 200);
  assert.equal((await api(`/api/share/${token}`)).status, 404);
  assert.equal((await api(`/api/share/${token}/image/1`)).status, 404);
});

test('an expired link opens nothing; wrong links and requests are refused', async (t) => {
  t.after(async () => {
    await removeShares('alice');
    await removeUploads('alice');
  });
  await upload('alice', 'photo.jpg');
  const { body } = await share('alice', { paths: ['photo.jpg'] });
  assert.equal(body.title, '1 image', 'a title by default');
  assert.equal(body.expires, null, 'never expires by default');

  await redis(async (client) => {
    const stored = JSON.parse(await client.hGet('shares', body.token));
    await client.hSet('shares', body.token, JSON.stringify({ ...stored, expires: Date.now() - 1000 }));
  });
  const expired = await api(`/api/share/${body.token}`);
  assert.equal(expired.status, 404);
  assert.equal(expired.body.message, 'This link has expired');
  assert.equal((await api(`/api/share/${body.token}/image/0`)).status, 404);
  assert.equal((await api('/api/shares', { as: 'alice' })).body.shares[0].expired, true, 'told to its owner');

  for (const json of [{}, { paths: [] }, { paths: 'photo.jpg' }, { paths: [3] }, { paths: ['photo.jpg'], expiresInDays: 3 }, { paths: ['missing.jpg'] }]) {
    assert.equal((await share('alice', json)).status, 400, JSON.stringify(json));
  }
  assert.equal((await share(undefined, { paths: ['photo.jpg'] })).status, 401);
  assert.equal((await api('/api/shares')).status, 401);
  for (const token of ['short', 'A'.repeat(22), '../../etc/passwd', `${'A'.repeat(21)}!`]) {
    assert.equal((await api(`/api/share/${encodeURIComponent(token)}`)).status, 404, token);
  }
});

test('deleting an account revokes its links', async (t) => {
  const name = 'sharer';
  t.after(() => api(`/api/admin/users/${name}`, { as: 'boss', method: 'DELETE' }));
  const created = await api('/api/admin/users', { as: 'boss', json: { username: name, email: 'sharer@test.io', password: 'sharerpass1' } });
  assert.ok(created.status < 300, JSON.stringify(created.body));
  const signedIn = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'sharerpass1' }),
  });
  const cookie = signedIn.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  assert.ok(cookie, 'signed in');
  await fetch(`${BASE}/api/user/files/upload`, { method: 'POST', headers: { Cookie: cookie }, body: fileForm('tiny.png') });
  const shared = await (await fetch(`${BASE}/api/shares`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: ['tiny.png'] }),
  })).json();
  assert.equal((await api(`/api/share/${shared.token}`)).status, 200, JSON.stringify(shared));

  assert.ok((await api(`/api/admin/users/${name}`, { as: 'boss', method: 'DELETE' })).status < 300);
  assert.equal((await api(`/api/share/${shared.token}`)).status, 404);
  assert.equal(await redis((client) => client.exists(`${name}:shares`)), 0);
});
