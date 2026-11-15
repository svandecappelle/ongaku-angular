import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { APP, BASE, api } from '../helpers/client.mjs';

/** Signs up as an anonymous visitor: { status, body, cookie } */
async function register(fields) {
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  return { status: response.status, body: await response.json(), cookie };
}
const account = (name, invite) => ({ username: name, email: `${name}@test.io`, password: `${name}pass1`, confirmPassword: `${name}pass1`, invite });
const invite = (json = {}) => api('/api/admin/invites', { as: 'boss', json });
const removeUser = (name) => api(`/api/admin/users/${name}`, { as: 'boss', method: 'DELETE' });
const removeInvites = async () => {
  for (const item of (await api('/api/admin/invites', { as: 'boss' })).body.invites ?? []) {
    await api(`/api/admin/invites/${item.token}`, { as: 'boss', method: 'DELETE' });
  }
};

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

test('a join link creates one account while sign up is closed, then no more', async (t) => {
  t.after(async () => {
    await removeInvites();
    for (const name of ['joined1', 'joined2']) {
      await removeUser(name);
    }
  });
  // Sign up is closed by default
  assert.equal((await register(account('joined1'))).status, 403);

  const created = await invite({ note: 'For Dana', expiresInDays: 7 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(created.body.note, 'For Dana');
  assert.equal(created.body.state, 'open');
  assert.equal(created.body.createdBy, 'boss');
  assert.ok(Math.abs(created.body.expires - (Date.now() + 7 * 86400000)) < 60000);
  const token = created.body.token;

  const check = await api(`/api/auth/invite/${token}`);
  assert.equal(check.status, 200);
  assert.equal(check.body.invitedBy, 'boss');

  // The link: the account is made and signed in
  const joined = await register(account('joined1', token));
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.ok(joined.cookie, 'signed in');
  const me = await fetch(`${BASE}/api/auth/`, { headers: { Cookie: joined.cookie } }).then((r) => r.json());
  assert.equal(me.username, 'joined1');
  assert.equal(me.administrator, false);

  // Used: told to the administrators, refused to anyone else
  const listed = (await api('/api/admin/invites', { as: 'boss' })).body.invites.find((item) => item.token === token);
  assert.equal(listed.state, 'used');
  assert.equal(listed.usedBy, 'joined1');
  assert.equal((await api(`/api/auth/invite/${token}`)).status, 404);
  const again = await register(account('joined2', token));
  assert.equal(again.status, 403);
  assert.equal(again.body.message, 'This join link was used already');
});

test('a sign up that fails gives the link back; two at once: one account only', async (t) => {
  t.after(async () => {
    await removeInvites();
    for (const name of ['racer1', 'racer2', 'second1']) {
      await removeUser(name);
    }
  });
  const { token } = (await invite()).body;
  // The name is taken: the link stays usable
  const taken = await register({ ...account('carol', token), email: 'other-carol@test.io' });
  assert.equal(taken.status, 409);
  assert.equal((await api(`/api/auth/invite/${token}`)).status, 200);
  assert.equal((await register(account('second1', token))).status, 200);

  const { token: raced } = (await invite()).body;
  const answers = await Promise.all([register(account('racer1', raced)), register(account('racer2', raced))]);
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 403], JSON.stringify(answers.map((a) => a.body)));
});

test('expired, revoked and wrong links create nothing; only administrators make them', async (t) => {
  t.after(removeInvites);
  const { token } = (await invite({ expiresInDays: 1 })).body;
  await redis(async (client) => {
    const stored = JSON.parse(await client.hGet('invites', token));
    await client.hSet('invites', token, JSON.stringify({ ...stored, expires: Date.now() - 1000 }));
  });
  const expired = await register(account('late1', token));
  assert.equal(expired.status, 403);
  assert.equal(expired.body.message, 'This join link has expired');
  assert.equal((await api('/api/admin/invites', { as: 'boss' })).body.invites.find((item) => item.token === token).state, 'expired');

  const { token: revoked } = (await invite({ expiresInDays: 0 })).body;
  assert.equal((await api('/api/admin/invites', { as: 'boss' })).body.invites.find((item) => item.token === revoked).expires, null, 'until used');
  assert.equal((await api(`/api/admin/invites/${revoked}`, { as: 'boss', method: 'DELETE' })).status, 200);
  assert.equal((await register(account('late2', revoked))).status, 403);
  assert.equal((await api(`/api/auth/invite/${revoked}`)).status, 404);

  for (const bad of ['short', 'A'.repeat(22), '../x']) {
    assert.equal((await register(account('late3', bad))).status, 403, bad);
    assert.equal((await api(`/api/auth/invite/${encodeURIComponent(bad)}`)).status, 404, bad);
  }
  assert.equal((await invite({ expiresInDays: 3 })).status, 400);
  assert.equal((await api('/api/admin/invites', { as: 'carol', json: {} })).status, 403);
  assert.equal((await api('/api/admin/invites', { as: 'carol' })).status, 403);
  assert.notEqual((await api('/api/admin/invites', { json: {} })).status, 201);
});
