import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api, uidOf } from '../helpers/client.mjs';

const play = (uid, as = 'alice') => api('/api/history/plays', { as, json: { uid } });
const clear = (as = 'alice') => api('/api/history', { as, method: 'DELETE' });
const today = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

test('plays are recorded: recently played, latest first and once; the same play reported twice counts once', async (t) => {
  t.after(() => clear());
  await clear();
  const one = await uidOf('Moon Safari 1');
  const two = await uidOf('Moon Safari 2');

  assert.equal((await play(one)).body.recorded, true);
  assert.equal((await play(one)).body.recorded, false, 'reported twice within 30 seconds');
  assert.equal((await play(two)).body.recorded, true);
  assert.equal((await play(one)).body.recorded, true, 'played again after another track');

  const { body } = await api('/api/history', { as: 'alice' });
  assert.equal(body.paused, false);
  assert.deepEqual(body.tracks.map((tr) => tr.uid), [one, two], 'latest first, each track once');
  assert.ok(body.tracks[0].playedAt >= body.tracks[1].playedAt);
  assert.equal((await api('/api/history?limit=1', { as: 'alice' })).body.tracks.length, 1);
});

test('stats: plays and time this month, top artists, the last 7 days', async (t) => {
  t.after(() => clear());
  await clear();
  const air = await uidOf('Moon Safari 1');
  const sidecar = await uidOf('Sidecar song');
  await play(air);
  await play(sidecar);
  await play(air);

  const { body } = await api('/api/history/stats', { as: 'alice' });
  assert.equal(body.month.plays, 3);
  assert.equal(body.total, 3);
  assert.ok(body.month.seconds >= 20, `seconds: ${body.month.seconds}`);
  assert.deepEqual(body.topArtists, [{ name: 'Air', plays: 2 }, { name: 'Lyric Band', plays: 1 }]);
  assert.equal(body.days.length, 7);
  assert.deepEqual(body.days.at(-1), { date: today(), plays: 3 });
  assert.ok(body.days.slice(0, -1).every((day) => day.plays === 0));
});

test('a paused history records nothing; clearing forgets everything', async (t) => {
  t.after(async () => {
    await api('/api/history/settings', { as: 'alice', method: 'PUT', json: { paused: false } });
    await clear();
  });
  const uid = await uidOf('Moon Safari 1');
  await play(uid);

  assert.equal((await api('/api/history/settings', { as: 'alice', method: 'PUT', json: { paused: true } })).body.paused, true);
  assert.equal((await play(await uidOf('Moon Safari 2'))).body.recorded, false);
  const paused = await api('/api/history', { as: 'alice' });
  assert.equal(paused.body.paused, true);
  assert.deepEqual(paused.body.tracks.map((tr) => tr.uid), [uid], 'what was recorded before stays');

  assert.equal((await clear()).status, 200);
  assert.deepEqual((await api('/api/history', { as: 'alice' })).body.tracks, []);
  const stats = (await api('/api/history/stats', { as: 'alice' })).body;
  assert.equal(stats.month.plays, 0);
  assert.deepEqual(stats.topArtists, []);
});

test('the history is per user, needs a session and checks its input', async (t) => {
  t.after(() => clear());
  const uid = await uidOf('Moon Safari 1');
  await play(uid);
  assert.ok(!(await api('/api/history', { as: 'carol' })).body.tracks.some((tr) => tr.uid === uid));
  assert.equal((await api('/api/history')).status, 401);
  assert.equal((await api('/api/history/plays', { json: { uid } })).status, 401);
  assert.equal((await play(42)).status, 400);
  assert.equal((await play('unknown-track')).status, 404);
  assert.equal((await api('/api/history/settings', { as: 'alice', method: 'PUT', json: { paused: 'yes' } })).status, 400);
});
