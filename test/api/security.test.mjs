import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { APP, BASE, api, login } from '../helpers/client.mjs';

const require = createRequire(import.meta.url);

test('the session cookie is HttpOnly and SameSite=Lax', async () => {
  const response = await fetch(`${BASE}/api/auth/`);
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
  assert.ok(cookie, 'a session cookie');
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; SameSite=Lax/i);
});

test('a change asked by a page of another site is refused; from this site, or from a program, it passes', async (t) => {
  const name = 'Cross site probe';
  t.after(() => api(`/api/playlist/${encodeURIComponent(name)}`, { as: 'carol', method: 'DELETE' }));
  const cookie = await login('carol');
  const create = (headers) => fetch(`${BASE}/api/playlist`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ name }),
  });

  const forged = await create({ Origin: 'https://evil.example' });
  assert.equal(forged.status, 403);
  assert.equal((await create({ Referer: 'https://evil.example/page' })).status, 403, 'the Referer without Origin');
  assert.equal((await create({ Origin: 'null' })).status, 403, 'an opaque origin');
  assert.ok(!JSON.stringify((await api('/api/playlist', { as: 'carol' })).body).includes(name), 'nothing created');

  assert.equal((await create({ Origin: BASE })).status, 201, 'from this site');
  // Reading stays open: a GET changes nothing
  assert.equal((await fetch(`${BASE}/api/playlist`, { headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status, 200);
});

test('the guessing of a password is slowed down: 429 after 5 failures, with Retry-After', async () => {
  const attempt = () => fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nobody-guessed', password: 'wrong-password' }),
  });
  for (let i = 0; i < 5; i++) {
    const response = await attempt();
    assert.notEqual(response.status, 429, `attempt ${i + 1}`);
    assert.notEqual(response.status, 200);
  }
  const refused = await attempt();
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get('retry-after')) > 0);
  assert.match((await refused.json()).message, /Too many attempts/);

  // The other accounts of the same address still sign in
  const other = await api('/api/auth/', { as: 'alice' });
  assert.equal(other.body.connected, true);
});

test('the session secret: a weak or published one is replaced by a random one', () => {
  const { ensureConfig, weakSecret } = require(path.join(APP, 'server/app/utils/config-file.js'));
  for (const secret of ['', 'change-me', 'keyboard cat', 'short', 'eba16c61-18db-471a-9406-6371d7e42f63']) {
    assert.ok(weakSecret(secret), `"${secret}" is weak`);
  }
  assert.ok(!weakSecret('5f2b9a0c7e4d1f3a8b6c9d0e2f4a6b8c'));

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-config-test-'));
  try {
    const log = { warn: () => {} };
    const example = path.join(folder, 'example.yml');
    const file = path.join(folder, 'application.yml');
    fs.writeFileSync(example, '# The secret signs the cookies\nport: 4000\nsecret:\nthird-party:\n    lastfm:\n        secret:\n');

    assert.equal(ensureConfig({ file, example, log }), true, 'created, with a new secret');
    const text = fs.readFileSync(file, 'utf8');
    const secret = /^secret: (\w+)$/m.exec(text)[1];
    assert.equal(secret.length, 64);
    assert.match(text, /^# The secret signs the cookies\nport: 4000\n/, 'the rest of the file as it was');
    assert.match(text, /^ {8}secret:$/m, 'the secrets of the API keys left alone');

    assert.equal(ensureConfig({ file, example, log }), false, 'a strong secret is kept');
    assert.equal(/^secret: (\w+)$/m.exec(fs.readFileSync(file, 'utf8'))[1], secret);

    fs.writeFileSync(file, 'port: 4000\nsecret: change-me\n');
    fs.chmodSync(file, 0o400);
    if (process.getuid && process.getuid() !== 0) {
      assert.throws(() => ensureConfig({ file, example, log }), /cannot be written/, 'read only: the server does not start');
    }
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
