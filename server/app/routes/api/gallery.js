const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('log4js').getLogger('Gallery');

const gallery = require('../../middleware/gallery');
const { insideUploads } = require('../../middleware/uploads-path');

/**
 * The images of the connected member, from his uploads: only him, administrators included
 * (login required, see guards.js; the paths are always the ones of his own uploads folder).
 *
 * - GET /                 { images: [{ path, name, folder, size, modified }] }, the latest first
 * - GET /file?path=…      the image (&download=1: as a download)
 * - GET /thumb?path=…&size=320|640  a JPEG thumbnail, made once
 */
const router = express.Router();

function usernameOf(req) {
  return req.session && req.session.passport && req.session.passport.user ? req.session.passport.user.username : null;
}

/** The image asked, with its stat; else answers 400 or 404 and resolves null */
async function found(req, res) {
  const username = usernameOf(req);
  if (!username) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }
  const relative = typeof req.query.path === 'string' ? req.query.path : '';
  const file = relative ? insideUploads(username, relative) : null;
  if (!file || !gallery.isImage(file)) {
    res.status(400).json({ message: 'Invalid image path' });
    return null;
  }
  try {
    const stat = await fs.promises.stat(file);
    if (stat.isFile()) {
      return { username, file, stat };
    }
  } catch (err) {
    // Not there
  }
  res.status(404).json({ message: 'No such image' });
  return null;
}

/** Headers of an image of a member: kept by his browser only, never read as something else */
function privateHeaders(res, type) {
  res.set({
    'Content-Type': type,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
}

router.get('/', (req, res, next) => {
  const username = usernameOf(req);
  if (!username) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  gallery.list(username).then((images) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ images });
  }).catch(next);
});

router.get('/file', async (req, res) => {
  const image = await found(req, res);
  if (!image) {
    return;
  }
  privateHeaders(res, gallery.mimeOf(image.file));
  if (req.query.download) {
    res.attachment(path.basename(image.file));
  }
  res.sendFile(image.file, { cacheControl: false }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: 'The image cannot be read' });
    }
  });
});

router.get('/thumb', async (req, res) => {
  const size = Number(req.query.size) || gallery.THUMB_SIZES[0];
  if (!gallery.THUMB_SIZES.includes(size)) {
    return res.status(400).json({ message: `size must be one of ${gallery.THUMB_SIZES.join(', ')}` });
  }
  const image = await found(req, res);
  if (!image) {
    return;
  }
  gallery.thumbnail(image.username, image.file, image.stat, size).then((thumb) => {
    privateHeaders(res, 'image/jpeg');
    res.sendFile(thumb, { cacheControl: false, dotfiles: 'allow' });
  }).catch((err) => {
    logger.warn(`No thumbnail for ${image.file}: ${err.message}`);
    res.status(422).json({ message: 'No thumbnail can be made of this image' });
  });
});

module.exports = router;
