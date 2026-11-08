import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE, api } from '../helpers/client.mjs';

async function loginStatus(username, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  if (!cookie) {
    return { connected: false };
  }
  return (await fetch(`${BASE}/api/auth/`, { headers: { Cookie: cookie } })).json();
}

async function listed(username) {
  const { body } = await api('/api/admin/users', { as: 'boss' });
  return body.find((user) => user.username === username);
}

test('create a user; duplicates and bad names are refused', async (t) => {
  t.after(() => api('/api/admin/users/dave', { as: 'boss', method: 'DELETE' }));
  const created = await api('/api/admin/users', { as: 'boss', json: { username: 'dave', email: 'dave@test.io', password: 'davepass1' } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal((await loginStatus('dave', 'davepass1')).username, 'dave');

  const sameName = await api('/api/admin/users', { as: 'boss', json: { username: 'dave', email: 'other@test.io', password: 'davepass1' } });
  assert.equal(sameName.status, 409);
  const sameEmail = await api('/api/admin/users', { as: 'boss', json: { username: 'dave2', email: 'dave@test.io', password: 'davepass1' } });
  assert.equal(sameEmail.status, 409, 'an e-mail already used');
  const badName = await api('/api/admin/users', { as: 'boss', json: { username: 'bad name!', email: 'bad@test.io', password: 'badpass12' } });
  assert.equal(badName.status, 400);
  const missing = await api('/api/admin/users', { as: 'boss', json: { username: 'nopass', email: 'nopass@test.io' } });
  assert.equal(missing.status, 400);
});

test('a user cannot create accounts', async () => {
  const response = await api('/api/admin/users', { as: 'alice', json: { username: 'mallory', email: 'mallory@test.io', password: 'mallory123' } });
  assert.equal(response.status, 403);
});

test('ban and unban: a banned user cannot log in', async (t) => {
  t.after(() => api('/api/admin/users/erin', { as: 'boss', method: 'DELETE' }));
  await api('/api/admin/users', { as: 'boss', json: { username: 'erin', email: 'erin@test.io', password: 'erinpass1' } });

  assert.equal((await api('/api/admin/users/erin', { as: 'boss', method: 'PUT', json: { banned: true } })).status, 200);
  assert.equal((await listed('erin')).banned, true);
  assert.equal((await loginStatus('erin', 'erinpass1')).connected, false);

  await api('/api/admin/users/erin', { as: 'boss', method: 'PUT', json: { banned: false } });
  assert.equal((await loginStatus('erin', 'erinpass1')).username, 'erin');
});

test('change the password and the role of a user', async (t) => {
  t.after(() => api('/api/admin/users/frank', { as: 'boss', method: 'DELETE' }));
  await api('/api/admin/users', { as: 'boss', json: { username: 'frank', email: 'frank@test.io', password: 'frankpass1' } });

  await api('/api/admin/users/frank', { as: 'boss', method: 'PUT', json: { password: 'newpass123' } });
  assert.equal((await loginStatus('frank', 'frankpass1')).connected, false, 'old password refused');
  assert.equal((await loginStatus('frank', 'newpass123')).username, 'frank');

  await api('/api/admin/users/frank', { as: 'boss', method: 'PUT', json: { administrator: true } });
  assert.equal((await listed('frank')).administrator, true);
  await api('/api/admin/users/frank', { as: 'boss', method: 'PUT', json: { administrator: false } });
  assert.equal((await listed('frank')).administrator, false);
});

test('an administrator cannot demote, ban or delete himself', async () => {
  assert.equal((await api('/api/admin/users/boss', { as: 'boss', method: 'PUT', json: { administrator: false } })).status, 400);
  assert.equal((await api('/api/admin/users/boss', { as: 'boss', method: 'PUT', json: { banned: true } })).status, 400);
  assert.equal((await api('/api/admin/users/boss', { as: 'boss', method: 'DELETE' })).status, 400);
  assert.equal((await listed('boss')).administrator, true);
});

test('delete a user: account and data gone', async () => {
  await api('/api/admin/users', { as: 'boss', json: { username: 'gina', email: 'gina@test.io', password: 'ginapass1' } });
  assert.equal((await api('/api/admin/users/gina', { as: 'boss', method: 'DELETE' })).status, 200);
  assert.equal(await listed('gina'), undefined);
  assert.equal((await loginStatus('gina', 'ginapass1')).connected, false);
  assert.equal((await api('/api/admin/users/nobody', { as: 'boss', method: 'DELETE' })).status, 404);
});

test('the public list of users has no e-mail', async () => {
  const { body } = await api('/api/users/list', { as: 'alice' });
  const names = body.map((user) => user.username);
  assert.ok(names.includes('boss') && names.includes('alice'));
  assert.ok(body.every((user) => user.email === undefined), 'no e-mail in the public list');
});

test('a profile shows the e-mail to its owner only', async () => {
  assert.equal((await api('/api/user/me', { as: 'alice' })).body.email, 'alice@test.io');
  assert.equal((await api('/api/user/alice', { as: 'carol' })).body.email, undefined);
  assert.equal((await api('/api/user/nobody', { as: 'carol' })).status, 404);
});
