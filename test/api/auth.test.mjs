import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE, USERS, api, login } from '../helpers/client.mjs';

test('auth status: anonymous, user, administrator', async () => {
  const anonymous = await api('/api/auth/');
  assert.equal(anonymous.body.connected, false);
  assert.equal(anonymous.body.administrator, false);

  const alice = await api('/api/auth/', { as: 'alice' });
  assert.deepEqual([alice.body.connected, alice.body.administrator, alice.body.username], [true, false, 'alice']);

  const boss = await api('/api/auth/', { as: 'boss' });
  assert.deepEqual([boss.body.connected, boss.body.administrator, boss.body.username], [true, true, 'boss']);
});

test('login: a wrong password opens no session', async () => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERS.alice.username, password: 'wrong-password' }),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  if (cookie) {
    const status = await (await fetch(`${BASE}/api/auth/`, { headers: { Cookie: cookie } })).json();
    assert.equal(status.connected, false);
  }
});

test('login with the e-mail address', async () => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERS.carol.email, password: USERS.carol.password }),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  assert.ok(cookie, 'a session cookie');
  const status = await (await fetch(`${BASE}/api/auth/`, { headers: { Cookie: cookie } })).json();
  assert.equal(status.username, 'carol');
});

test('administration routes: 401 anonymous, 403 for a user, 200 for an administrator', async () => {
  for (const route of ['/api/admin/users', '/api/admin/library/health', '/api/admin/library/duplicates', '/api/admin/library/import']) {
    assert.equal((await api(route)).status, 401, `${route} anonymous`);
    assert.equal((await api(route, { as: 'alice' })).status, 403, `${route} as a user`);
    assert.equal((await api(route, { as: 'boss' })).status, 200, `${route} as the administrator`);
  }
});

test('the install route cannot create a second administrator', async () => {
  const response = await api('/api/install', { json: { username: 'intruder', email: 'intruder@test.io', password: 'intruderpass1' } });
  assert.equal(response.status, 403);
  const users = await api('/api/admin/users', { as: 'boss' });
  assert.ok(!users.body.some((user) => user.username === 'intruder'), 'no account created');
});

test('sessions are per user', async () => {
  assert.notEqual(await login('alice'), await login('carol'));
});
