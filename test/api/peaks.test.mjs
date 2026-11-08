import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { APP, BASE, api, login, uidOf } from '../helpers/client.mjs';

test('the waveform of a track: 400 values, computed once then cached outside the music', async () => {
  const uid = await uidOf('Sidecar song');
  const first = await api(`/api/audio/peaks/${uid}`, { as: 'carol' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const peaks = first.body.peaks;
  assert.equal(peaks.length, 400);
  assert.ok(peaks.every((value) => Number.isInteger(value) && value >= 0 && value <= 255));
  assert.equal(Math.max(...peaks), 255, 'the loudest part at the top');

  const cache = path.join(APP, 'public/.cache/peaks', `${uid}.json`);
  assert.ok(fs.existsSync(cache), 'cached');
  const stamp = JSON.parse(fs.readFileSync(cache, 'utf8')).stamp;
  assert.deepEqual((await api(`/api/audio/peaks/${uid}`, { as: 'carol' })).body.peaks, peaks, 'the same from the cache');
  assert.equal(JSON.parse(fs.readFileSync(cache, 'utf8')).stamp, stamp);

  // The cache is not served as a static file
  const leaked = await fetch(`${BASE}/static/.cache/peaks/${uid}.json`, { headers: { Cookie: await login('carol') } });
  assert.ok(!(await leaked.text()).includes('"stamp"'));
});

test('the waveform needs a session and a known track', async () => {
  const uid = await uidOf('Sidecar song');
  assert.equal((await api(`/api/audio/peaks/${uid}`)).status, 401);
  assert.equal((await api('/api/audio/peaks/unknown-uid', { as: 'carol' })).status, 404);
});
