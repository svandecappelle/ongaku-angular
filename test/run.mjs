#!/usr/bin/env node
/**
 * Runs the test suite against a throw-away instance of Ongaku:
 *  1. builds a fixture in a temporary folder (generated music, configuration, copy of the server)
 *  2. starts the server on ONGAKU_TEST_PORT (4200) with the Redis database ONGAKU_TEST_REDIS_DB (14),
 *     which is flushed first: never point it at a database you use
 *  3. creates the accounts, then runs the test files with node:test
 *  4. stops the server and removes the fixture, also on failure
 *
 * Usage: node test/run.mjs [api|e2e] [--keep]
 *   api / e2e  only that folder (default: both; e2e is skipped without a built client or a browser)
 *   --keep     keep the fixture folder and print its path (to read server.log)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixture, findChrome, resolveShared } from './helpers/fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ONGAKU_TEST_PORT || 4200);
const REDIS_DB = Number(process.env.ONGAKU_TEST_REDIS_DB || 14);
const args = process.argv.slice(2);
const only = args.find((arg) => arg === 'api' || arg === 'e2e');
const keep = args.includes('--keep');

const USERS = {
  boss: { username: 'boss', email: 'boss@test.io', password: 'bosspass1', administrator: true },
  alice: { username: 'alice', email: 'alice@test.io', password: 'alicepass1' },
  carol: { username: 'carol', email: 'carol@test.io', password: 'carolpass1' },
};

const log = (message) => console.log(`[test] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`[test] ${message}`);
  process.exitCode = 1;
}

async function flushRedis(nodeModules) {
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(nodeModules, 'noop.js'));
  const { createClient } = require('redis');
  const client = createClient({
    socket: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) },
    password: process.env.REDIS_PASSWORD || undefined,
    database: REDIS_DB,
  });
  client.on('error', () => {});
  await client.connect();
  await client.flushDb();
  await client.quit();
}

async function portIsFree(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch {
    return true;
  }
}

async function waitFor(check, what, timeout = 60000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      if (await check()) {
        return;
      }
    } catch (err) {
      last = err;
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${what}${last ? `: ${last.message}` : ''}`);
}

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, body, headers: response.headers };
}

async function login(base, user) {
  const response = await request(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
  if (!cookie) {
    throw new Error(`Cannot log in as ${user.username} (${response.status})`);
  }
  return cookie;
}

function testFiles(folder) {
  const dir = path.join(ROOT, 'test', folder);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f)) : [];
}

async function main() {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    log('ffmpeg is needed to generate the test music: skipping the suite.');
    return;
  }
  const shared = resolveShared(ROOT);
  if (!shared.nodeModules) {
    fail('No node_modules found: run "npm install" first.');
    return;
  }
  if (!(await portIsFree(PORT))) {
    fail(`Port ${PORT} is in use: stop what listens on it or set ONGAKU_TEST_PORT.`);
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-test-'));
  let server = null;
  const cleanup = async () => {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => server.once('exit', resolve)), sleep(5000)]);
      if (server.exitCode === null) {
        server.kill('SIGKILL');
      }
    }
    try {
      await flushRedis(shared.nodeModules);
    } catch {
      // Redis gone: nothing to clean
    }
    if (keep) {
      log(`Fixture kept in ${workDir}`);
    } else {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  };
  process.once('SIGINT', () => cleanup().then(() => process.exit(130)));

  try {
    log(`Fixture in ${workDir}`);
    const fixture = buildFixture({ root: ROOT, workDir, port: PORT, redisDb: REDIS_DB, shared });
    await flushRedis(shared.nodeModules);

    const logFile = fs.openSync(path.join(workDir, 'server.log'), 'w');
    server = spawn(process.execPath, ['server/index.js'], {
      cwd: fixture.app,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: ['ignore', logFile, logFile],
    });
    server.once('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`[test] The server stopped (code ${code}); see ${path.join(workDir, 'server.log')}`);
      }
    });

    const base = `http://127.0.0.1:${PORT}`;
    await waitFor(async () => (await request(`${base}/api/install`)).status < 500, 'the server to listen');
    const install = await request(`${base}/api/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERS.boss.username, email: USERS.boss.email, password: USERS.boss.password }),
    });
    if (install.status !== 200) {
      throw new Error(`Install failed (${install.status})`);
    }
    await sleep(500);
    const bossCookie = await login(base, USERS.boss);
    for (const name of ['alice', 'carol']) {
      const created = await request(`${base}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bossCookie },
        body: JSON.stringify(USERS[name]),
      });
      if (created.status !== 200) {
        throw new Error(`Cannot create ${name} (${created.status}: ${JSON.stringify(created.body)})`);
      }
    }
    // The scan of the music folder ends before the tests start
    await waitFor(async () => {
      const health = await request(`${base}/api/admin/library/health`, { headers: { Cookie: bossCookie } });
      const tracks = await request(`${base}/api/audio/tracks/filter/Sidecar/0`, { headers: { Cookie: bossCookie } });
      return health.status === 200 && !health.body.scanning && Array.isArray(tracks.body) && tracks.body.length > 0;
    }, 'the library scan');

    const folders = only ? [only] : ['api', 'e2e'];
    const files = folders.flatMap(testFiles);
    const chrome = findChrome();
    const env = {
      ...process.env,
      ONGAKU_TEST_URL: base,
      ONGAKU_TEST_USERS: JSON.stringify(USERS),
      ONGAKU_TEST_MUSIC: fixture.music,
      ONGAKU_TEST_APP: fixture.app,
      ONGAKU_TEST_ASSETS: fixture.assets,
      ONGAKU_TEST_SHARED: JSON.stringify(shared),
      ONGAKU_TEST_CLIENT: fixture.client ? '1' : '',
      CHROME: chrome ?? '',
    };
    if (folders.includes('e2e') && (!fixture.client || !chrome)) {
      log(`Browser tests skipped: ${!fixture.client ? 'no built client (client/dist; "make test" builds it)' : 'no Chromium found (set CHROME)'}.`);
    }
    log(`Running ${files.length} test files`);
    const started = Date.now();
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files], {
      cwd: ROOT,
      env,
      stdio: 'inherit',
    });
    log(`Done in ${Math.round((Date.now() - started) / 1000)}s`);
    if (result.status !== 0) {
      process.exitCode = result.status || 1;
      log(`Server log: ${path.join(workDir, 'server.log')}${keep ? '' : ' (removed; run with --keep to read it)'}`);
    }
  } catch (err) {
    fail(err.stack || err.message);
    const logPath = path.join(workDir, 'server.log');
    if (fs.existsSync(logPath)) {
      console.error(fs.readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n'));
    }
  } finally {
    await cleanup();
  }
}

main();
