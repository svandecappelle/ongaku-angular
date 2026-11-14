import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { APP, BASE, api } from '../helpers/client.mjs';

const DIST = path.join(APP, 'android/dist');
const FINGERPRINT = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0').toUpperCase()).join(':');

/** A built application, as "make apk" leaves it */
function build({ fingerprints = [FINGERPRINT] } = {}) {
  fs.mkdirSync(DIST, { recursive: true });
  const apk = crypto.randomBytes(5000);
  fs.writeFileSync(path.join(DIST, 'ongaku.apk'), apk);
  fs.writeFileSync(path.join(DIST, 'ongaku.json'), JSON.stringify({
    package: 'io.github.svandecappelle.ongaku', versionName: '1.0.0', versionCode: 42,
    size: apk.length, fingerprints, built: '2026-11-14T10:00:00Z',
  }));
  return apk;
}

test('without a built application: nothing to download, no key published', async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  const info = await api('/api/app/android');
  assert.equal(info.status, 200);
  assert.deepEqual(info.body, { available: false });
  assert.equal((await api('/download/ongaku.apk')).status, 404);
  const links = await api('/.well-known/assetlinks.json');
  assert.equal(links.status, 200);
  assert.deepEqual(links.body, []);
});

test('the built application is offered to everyone, before signing in, with the key Chrome checks', async (t) => {
  t.after(() => fs.rmSync(DIST, { recursive: true, force: true }));
  const apk = build({ fingerprints: [FINGERPRINT, 'not a fingerprint'] });

  const info = await api('/api/app/android');
  assert.deepEqual(info.body, {
    available: true, versionName: '1.0.0', versionCode: 42, size: apk.length,
    built: '2026-11-14T10:00:00Z', download: '/download/ongaku.apk',
  });

  const download = await fetch(`${BASE}/download/ongaku.apk`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.match(download.headers.get('content-disposition'), /attachment; filename="?ongaku-1\.0\.0\.apk"?/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), apk);

  const links = await api('/.well-known/assetlinks.json');
  assert.deepEqual(links.body, [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'io.github.svandecappelle.ongaku', sha256_cert_fingerprints: [FINGERPRINT] },
  }], 'the invalid fingerprint is left out');
  assert.match(links.headers.get('content-type'), /^application\/json/);
});

test('a broken description of the application counts as no application', async (t) => {
  t.after(() => fs.rmSync(DIST, { recursive: true, force: true }));
  build();
  fs.writeFileSync(path.join(DIST, 'ongaku.json'), '{ broken');
  assert.deepEqual((await api('/api/app/android')).body, { available: false });
  assert.equal((await api('/download/ongaku.apk')).status, 404);
  assert.deepEqual((await api('/.well-known/assetlinks.json')).body, []);
});
