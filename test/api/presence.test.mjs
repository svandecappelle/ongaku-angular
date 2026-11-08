import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { BASE, api, eventually, login, uidOf } from '../helpers/client.mjs';

// socket.io-client is a dependency of the client: taken from its node_modules (or the root one)
const shared = JSON.parse(process.env.ONGAKU_TEST_SHARED || '{}');
let io = null;
for (const dir of [shared.clientNodeModules, shared.nodeModules].filter(Boolean)) {
  try {
    io = createRequire(path.join(dir, 'noop.js'))('socket.io-client').io;
    break;
  } catch {
    // Not there
  }
}
const skip = io ? false : 'socket.io-client not installed (npm install in client/)';

/** A socket of the page of a user, connected */
async function connect(name) {
  const socket = io(BASE, { extraHeaders: { Cookie: await login(name) }, transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    socket.once('connected', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

async function presenceOf(username, as = 'boss') {
  return (await api('/api/users/presence', { as })).body.find((p) => p.username === username);
}

test('online while a tab is connected, offline when the last one closes', { skip }, async () => {
  const first = await connect('carol');
  const second = await connect('carol');
  await eventually(async () => (await presenceOf('carol'))?.online, { what: 'carol online' });

  first.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok((await presenceOf('carol'))?.online, 'still a tab open');
  second.disconnect();
  await eventually(async () => !(await presenceOf('carol')), { what: 'carol offline' });
  const listed = (await api('/api/users/list', { as: 'alice' })).body.find((u) => u.username === 'carol');
  assert.equal(listed.online, false);
});

test('what a member plays reaches the others, live; private uploads and hidden users excepted', { skip }, async (t) => {
  const carol = await connect('carol');
  const alice = await connect('alice');
  t.after(async () => {
    await api('/api/user/settings/listening', { as: 'carol', method: 'PUT', json: { share: true } });
    carol.disconnect();
    alice.disconnect();
  });
  const updates = [];
  alice.on('presence:update', (presence) => updates.push(presence));

  const uid = await uidOf('Moon Safari 1');
  carol.emit('now-playing', { uid, playing: true, position: 12 });
  const update = await eventually(() => updates.find((p) => p.username === 'carol' && p.nowPlaying), { what: 'the update of carol' });
  assert.equal(update.nowPlaying.title, 'Moon Safari 1');
  assert.equal(update.nowPlaying.playing, true);
  assert.equal(update.nowPlaying.position, 12);
  assert.equal((await presenceOf('carol', 'alice')).nowPlaying.uid, uid);

  carol.emit('now-playing', { uid: 'unknown-or-private', playing: true });
  await eventually(async () => (await presenceOf('carol'))?.nowPlaying === null, { what: 'an unknown track hidden' });

  carol.emit('now-playing', { uid, playing: true, position: 0 });
  await eventually(async () => (await presenceOf('carol'))?.nowPlaying, { what: 'carol playing again' });
  assert.equal((await api('/api/user/settings/listening', { as: 'carol', method: 'PUT', json: { share: false } })).status, 200);
  await eventually(async () => (await presenceOf('carol'))?.nowPlaying === null, { what: 'carol hidden' });
  assert.equal((await api('/api/user/me', { as: 'carol' })).body.shareListening, false);
  assert.ok((await presenceOf('carol'))?.online, 'hidden user still online');
});

test('an anonymous socket is not a member', { skip }, async () => {
  const socket = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve) => socket.once('connected', resolve));
  socket.emit('now-playing', { uid: 'x', playing: true });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await api('/api/users/presence')).status, 401);
  socket.disconnect();
});

test('the listening setting is checked', async () => {
  assert.equal((await api('/api/user/settings/listening', { as: 'carol', method: 'PUT', json: { share: 'yes' } })).status, 400);
  assert.equal((await api('/api/user/settings/listening', { method: 'PUT', json: { share: true } })).status, 401);
});
