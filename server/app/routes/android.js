const express = require('express');
const fs = require('fs');
const path = require('path');
const nconf = require('nconf');

/**
 * The Android application (android/, built by "make apk"), open to everyone: it is installed
 * before signing in.
 *
 * - GET /api/app/android           whether it can be downloaded, its version and size
 * - GET /download/ongaku.apk       the application
 * - GET /.well-known/assetlinks.json  the signing keys of the applications this site trusts:
 *   Chrome then opens the site full screen in them (Trusted Web Activity), without its
 *   address bar. The key of the APK served here, and the ones of "androidAppFingerprints"
 *   (application.yml) for an APK built elsewhere.
 */
const router = express.Router();

const PACKAGE = 'io.github.svandecappelle.ongaku';
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function distDirectory() {
  return path.resolve(nconf.get('androidDist') || path.resolve(__dirname, '../../../android/dist'));
}

/** The APK built and its description (dist/ongaku.json), or null */
function built() {
  const dist = distDirectory();
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dist, 'ongaku.json'), 'utf8'));
    const apk = path.join(dist, 'ongaku.apk');
    const stat = fs.statSync(apk);
    return { info, apk, size: stat.size, modified: stat.mtimeMs };
  } catch (err) {
    return null;
  }
}

function fingerprints(app) {
  const configured = [].concat(nconf.get('androidAppFingerprints') || []);
  const own = app && Array.isArray(app.info.fingerprints) ? app.info.fingerprints : [];
  return [...new Set([...own, ...configured].map((value) => String(value).trim().toUpperCase()))]
    .filter((value) => FINGERPRINT.test(value));
}

router.get('/api/app/android', (req, res) => {
  const app = built();
  res.set('Cache-Control', 'no-cache');
  if (!app) {
    return res.json({ available: false });
  }
  res.json({
    available: true,
    versionName: String(app.info.versionName || ''),
    versionCode: Number(app.info.versionCode) || null,
    size: app.size,
    built: app.info.built || null,
    download: '/download/ongaku.apk',
  });
});

router.get('/download/ongaku.apk', (req, res) => {
  const app = built();
  if (!app) {
    return res.status(404).json({ message: 'The Android application is not built on this server' });
  }
  const version = String(app.info.versionName || '').replace(/[^0-9A-Za-z.-]/g, '');
  res.set('Cache-Control', 'no-cache');
  res.download(app.apk, `ongaku${version ? `-${version}` : ''}.apk`, {
    headers: { 'Content-Type': 'application/vnd.android.package-archive' },
  }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: 'The Android application cannot be read' });
    }
  });
});

router.get('/.well-known/assetlinks.json', (req, res) => {
  const keys = fingerprints(built());
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(keys.length ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: keys },
  }] : []);
});

module.exports = router;
module.exports.PACKAGE = PACKAGE;
