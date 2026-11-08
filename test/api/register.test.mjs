import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE, api } from '../helpers/client.mjs';

/** Signs up as an anonymous visitor; the session cookie of the answer, if any */
async function register(fields) {
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  return { status: response.status, body: await response.json(), cookie };
}

// Sign up is closed until an administrator sets a maximum number of accounts
const setLimit = (limit) => api('/api/admin/configure', { as: 'boss', json: { allowRegisteration: limit } });
before(() => setLimit(20));
after(() => setLimit(0));

const valid = { username: 'newbie', email: 'newbie@test.io', password: 'newbiepass1', confirmPassword: 'newbiepass1' };

test('sign up tells whether it is open', async () => {
  const { status, body } = await api('/api/auth/register');
  assert.equal(status, 200);
  assert.equal(body.open, true);
  assert.ok(body.registerLeft > 0);
});

test('sign up creates the account and a working session', async (t) => {
  t.after(() => api('/api/admin/users/newbie', { as: 'boss', method: 'DELETE' }));
  const { status, body, cookie } = await register(valid);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.user.username, 'newbie');
  assert.ok(cookie, 'a session cookie');

  // The session guard keeps the session: it holds the username
  const auth = await (await fetch(`${BASE}/api/auth/`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual([auth.connected, auth.username, auth.administrator], [true, 'newbie', false]);
  const me = await fetch(`${BASE}/api/user/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).username, 'newbie');

  assert.equal((await register(valid)).status, 409, 'the same user name');
  assert.equal((await register({ ...valid, username: 'newbie2' })).status, 409, 'the same e-mail');
});

test('sign up checks its fields', async () => {
  const refused = async (fields) => (await register({ ...valid, username: 'checked', email: 'checked@test.io', ...fields })).status;
  assert.equal(await refused({ username: 'bad name!' }), 400);
  assert.equal(await refused({ email: 'not-an-email' }), 400);
  assert.equal(await refused({ password: 'short', confirmPassword: 'short' }), 400);
  assert.equal(await refused({ confirmPassword: 'different1' }), 400);
  assert.equal(await refused({ username: undefined }), 400);
  assert.equal((await api('/api/admin/users', { as: 'boss' })).body.some((user) => user.username === 'checked'), false);
});

test('sign up is closed without a maximum, or once it is reached', async () => {
  await setLimit(0);
  try {
    assert.equal((await api('/api/auth/register')).body.open, false);
    assert.equal((await register({ ...valid, username: 'closed', email: 'closed@test.io' })).status, 403);
    await setLimit(1);
    assert.deepEqual((await api('/api/auth/register')).body, { open: false, registerLeft: 0 }, 'more accounts than the maximum');
  } finally {
    await setLimit(20);
  }
});

test('a second installation is refused', async () => {
  const response = await fetch(`${BASE}/api/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'intruder', email: 'intruder@test.io', password: 'intruderpass1' }),
  });
  assert.equal(response.status, 403);
});
