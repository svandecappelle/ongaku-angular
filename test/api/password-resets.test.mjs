import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { APP, BASE, api } from '../helpers/client.mjs';

const NAME = 'resetme';

async function signIn(password, username = NAME) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  return { status: response.status, cookie };
}
const connected = async (cookie) => (await (await fetch(`${BASE}/api/auth/`, { headers: { Cookie: cookie } })).json()).connected;
const resetLink = (json = {}) => api(`/api/admin/users/${NAME}/reset-link`, { as: 'boss', json });
const reset = (token, password, confirmPassword = password) => api(`/api/auth/reset/${token}`, { json: { password, confirmPassword } });

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

async function freshAccount(t) {
  t.after(() => api(`/api/admin/users/${NAME}`, { as: 'boss', method: 'DELETE' }));
  const created = await api('/api/admin/users', { as: 'boss', json: { username: NAME, email: 'resetme@test.io', password: 'oldpassword1' } });
  assert.ok(created.status < 300, JSON.stringify(created.body));
}

test('a reset link changes the password once, and ends the sessions opened before', async (t) => {
  await freshAccount(t);
  const before = await signIn('oldpassword1');
  assert.equal(before.status, 200);
  assert.equal(await connected(before.cookie), true);

  // A second link replaces the first
  const first = (await resetLink()).body.token;
  const created = await resetLink({ expiresInHours: 1 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.username, NAME);
  assert.ok(Math.abs(created.body.expires - (Date.now() + 3600000)) < 60000);
  const token = created.body.token;
  assert.equal((await api(`/api/auth/reset/${first}`)).status, 404, 'replaced');
  assert.equal((await api(`/api/admin/users/${NAME}/reset-link`, { as: 'boss' })).body.reset.token, token);

  const check = await api(`/api/auth/reset/${token}`);
  assert.equal(check.status, 200);
  assert.equal(check.body.username, NAME);

  assert.equal((await reset(token, 'short')).status, 400);
  assert.equal((await reset(token, 'newpassword1', 'different1')).status, 400);
  const changed = await reset(token, 'newpassword1');
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.username, NAME);

  // The old session is over; the old password no longer works, the new one does
  assert.equal(await connected(before.cookie), false);
  assert.equal((await signIn('oldpassword1')).status >= 400, true);
  const after = await signIn('newpassword1');
  assert.equal(after.status, 200);
  assert.equal(await connected(after.cookie), true, 'a session opened after the change stays');

  // Once
  const again = await reset(token, 'otherpassword1');
  assert.equal(again.status, 404);
  assert.equal(again.body.message, 'This reset link was used already');
  assert.equal((await api(`/api/admin/users/${NAME}/reset-link`, { as: 'boss' })).body.reset, null);
});

test('a reset unlocks an account blocked by failed logins', async (t) => {
  await freshAccount(t);
  for (let i = 0; i < 6; i++) {
    await signIn('wrong-password');
  }
  assert.equal((await signIn('oldpassword1')).status, 429, 'blocked');
  const { token } = (await resetLink()).body;
  assert.equal((await reset(token, 'unlocked-pass1')).status, 200);
  assert.equal((await signIn('unlocked-pass1')).status, 200);
});

test('an administrator setting a password ends the sessions of the account too', async (t) => {
  await freshAccount(t);
  const session = await signIn('oldpassword1');
  assert.equal(await connected(session.cookie), true);
  assert.ok((await api(`/api/admin/users/${NAME}`, { as: 'boss', method: 'PUT', json: { password: 'byadmin-pass1' } })).status < 300);
  assert.equal(await connected(session.cookie), false);
  assert.equal((await signIn('byadmin-pass1')).status, 200);
  // The administrator himself stays signed in
  assert.equal((await api('/api/auth/', { as: 'boss' })).body.connected, true);
});

test('expired, revoked, deleted and wrong links change nothing; administrators only', async (t) => {
  await freshAccount(t);
  const { token } = (await resetLink()).body;
  await redis(async (client) => {
    const stored = JSON.parse(await client.hGet('password-resets', token));
    await client.hSet('password-resets', token, JSON.stringify({ ...stored, expires: Date.now() - 1000 }));
  });
  assert.equal((await reset(token, 'expired-pass1')).body.message, 'This reset link has expired');

  const { token: revoked } = (await resetLink()).body;
  assert.equal((await api(`/api/admin/users/${NAME}/reset-link`, { as: 'boss', method: 'DELETE' })).status, 200);
  assert.equal((await reset(revoked, 'revoked-pass1')).status, 404);

  const { token: orphan } = (await resetLink()).body;
  await api(`/api/admin/users/${NAME}`, { as: 'boss', method: 'DELETE' });
  assert.equal((await api(`/api/auth/reset/${orphan}`)).status, 404, 'the account is gone');

  for (const bad of ['short', 'A'.repeat(22)]) {
    assert.equal((await reset(bad, 'whatever-pass1')).status, 404, bad);
  }
  assert.equal((await api('/api/admin/users/alice/reset-link', { as: 'carol', json: {} })).status, 403);
  assert.equal((await api('/api/admin/users/nobody-here/reset-link', { as: 'boss', json: {} })).status, 404);
  assert.equal((await api('/api/admin/users/alice/reset-link', { as: 'boss', json: { expiresInHours: 5 } })).status, 400);
  // The signed-in members are untouched
  assert.equal((await api('/api/auth/', { as: 'alice' })).body.connected, true);
});
