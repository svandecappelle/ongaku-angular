import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE, api, fileForm, track } from '../helpers/client.mjs';

/** Session cookie of an account created by these tests (not in the shared users) */
async function loginAs(username, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
}

test('the API needs a login, except the authentication, the installation and the stream', async () => {
  for (const route of ['/api/audio/artists/0', '/api/audio/featured/0', '/api/users/list', '/api/user/me', '/api/playlist', '/api/likes/uids', '/api/lyrics/x']) {
    const response = await api(route);
    assert.equal(response.status, 401, route);
    assert.equal(response.body.message, 'You need to be logged', route);
  }
  assert.equal((await api('/api/auth/')).status, 200);
  assert.equal((await api('/api/install')).status, 200);
});

test('the upgrade routes are for the administrators', async () => {
  assert.equal((await api('/api/upgrade/git/check', { method: 'POST' })).status, 401);
  assert.equal((await api('/api/upgrade/git/check', { method: 'POST', as: 'alice' })).status, 403);
  assert.equal((await api('/api/upgrade', { as: 'alice' })).status, 403);
  const status = await api('/api/upgrade', { as: 'boss' });
  assert.equal(status.status, 200);
  assert.equal(status.body.title, 'Upgrader');
});

test('removed and unknown API routes answer a JSON 404', async () => {
  for (const [route, method] of [['/api/downloader/album/a/b', 'GET'], ['/api/admin/current', 'GET'], ['/api/audio/my-library', 'GET'],
    ['/api/statistics/plays/x', 'POST'], ['/api/audio/artist-properties/x', 'POST'], ['/api/files/set-properties/imported/x', 'POST'], ['/api/nope', 'GET']]) {
    const response = await api(route, { as: 'boss', method });
    assert.equal(response.status, 404, `${method} ${route}`);
    assert.deepEqual(response.body, { message: 'Not found' }, `${method} ${route}`);
  }
});

test('errors are short JSON messages, without stack traces', async () => {
  const invalid = await fetch(`${BASE}/api/playlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  const text = await invalid.text();
  assert.equal(invalid.status, 400);
  assert.ok(!/at .*\.js:\d+/.test(text) && !text.includes('<html'), 'no stack trace nor HTML page');

  const huge = await api('/api/playlist', { as: 'boss', json: { name: 'x'.repeat(2 * 1024 * 1024) } });
  assert.equal(huge.status, 413);
  assert.equal(typeof huge.body, 'object');
  assert.ok(!JSON.stringify(huge.body).includes('node_modules'));
});

test('a private upload is streamed to its owner only', async (t) => {
  // An account of its own: the uploads of the shared users are measured by the quota tests
  assert.equal((await api('/api/admin/users', { as: 'boss', json: { username: 'erin', email: 'erin@test.io', password: 'erinpass12' } })).status, 200);
  t.after(() => api('/api/admin/users/erin?files=true', { as: 'boss', method: 'DELETE' }));
  const cookie = await loginAs('erin', 'erinpass12');
  const form = fileForm('private.mp3');
  const upload = await fetch(`${BASE}/api/user/files/upload`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  assert.equal(upload.status, 200);
  const content = await fetch(`${BASE}/api/user/library/content`, { headers: { Cookie: cookie } }).then((r) => r.json());
  const uid = content.albums.flatMap((album) => album.tracks).find((t) => t.private)?.uid;
  assert.ok(uid, 'the upload is in the library of its owner');

  assert.equal((await api(`/api/audio/stream/${uid}`, { as: 'alice' })).status, 404);
  const owner = await fetch(`${BASE}/api/audio/stream/${uid}`, { headers: { Cookie: cookie } });
  assert.equal(owner.status, 200);
  await owner.arrayBuffer();
  assert.ok(await track('Discovery 1'), 'the public tracks still play');
});

test('the session of a disabled or deleted account ends at once', async () => {
  const created = await api('/api/admin/users', { as: 'boss', json: { username: 'dora', email: 'dora@test.io', password: 'dorapass12' } });
  assert.equal(created.status, 200);
  const cookie = await loginAs('dora', 'dorapass12');
  assert.ok(cookie);
  const me = () => fetch(`${BASE}/api/user/me`, { headers: { Cookie: cookie } }).then((r) => r.status);
  assert.equal(await me(), 200);

  assert.equal((await api('/api/admin/users/dora', { as: 'boss', method: 'PUT', json: { banned: true } })).status, 200);
  assert.equal(await me(), 401, 'disabled: signed out');
  const auth = await fetch(`${BASE}/api/auth/`, { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.equal(auth.connected, false);

  assert.equal((await api('/api/admin/users/dora', { as: 'boss', method: 'PUT', json: { banned: false } })).status, 200);
  const again = await loginAs('dora', 'dorapass12');
  assert.equal(await fetch(`${BASE}/api/user/me`, { headers: { Cookie: again } }).then((r) => r.status), 200);
  assert.equal((await api('/api/admin/users/dora', { as: 'boss', method: 'DELETE' })).status, 200);
  assert.equal(await fetch(`${BASE}/api/user/me`, { headers: { Cookie: again } }).then((r) => r.status), 401, 'deleted: signed out');
});
