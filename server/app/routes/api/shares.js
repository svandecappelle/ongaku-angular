const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('log4js').getLogger('Shares');

const gallery = require('../../middleware/gallery');
const { insideUploads } = require('../../middleware/uploads-path');
const shares = require('../../model/shares');

/**
 * Public links to a list of images of a member. The link holds a random token (128 bits):
 * whoever has it sees these images, without an account, until the owner revokes it or it
 * expires. Nothing else of the owner is reachable through it, nor the paths of his files.
 *
 * Owner, signed in (/api/shares):
 * - GET /                 { shares: [{ token, title, count, created, expires, expired, views }] }
 * - POST /                { title?, paths: [image paths of the uploads], expiresInDays?: 1 | 7 | 30 }
 * - DELETE /:token        revokes the link
 *
 * Everyone (/api/share, see guards.js):
 * - GET /:token                        { title, owner, created, expires, images: [{ index, name, size }] }
 * - GET /:token/image/:index           the image (&size=320|640: a thumbnail; &download=1)
 */
const owner = express.Router();
const visitor = express.Router();

const MAX_IMAGES = 500;
const MAX_SHARES = 200;
const MAX_TITLE = 100;
const EXPIRIES = [0, 1, 7, 30];
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const DAY = 24 * 60 * 60 * 1000;

function usernameOf(req) {
  return req.session && req.session.passport && req.session.passport.user ? req.session.passport.user.username : null;
}

const callback = (fn) => new Promise((resolve, reject) => fn((err, value) => (err ? reject(err) : resolve(value))));

function expired(share) {
  return !!share.expires && share.expires <= Date.now();
}

/** The file of an image of a share, if it is still an image of the uploads of its owner */
async function imageFile(share, relative) {
  const file = insideUploads(share.owner, relative);
  if (!file || !gallery.isImage(file)) {
    return null;
  }
  try {
    const stat = await fs.promises.stat(file);
    return stat.isFile() ? { file, stat } : null;
  } catch (err) {
    return null;
  }
}

/** The images of a share still there, with their place in it */
async function presentImages(share) {
  const images = await Promise.all(share.paths.map(async (relative, index) => {
    const found = await imageFile(share, relative);
    return found ? { index, name: path.posix.basename(relative), size: found.stat.size } : null;
  }));
  return images.filter(Boolean);
}

// ---------- Owner ----------

owner.use((req, res, next) => (usernameOf(req) ? next() : res.status(401).json({ message: 'Authentication required' })));

owner.get('/', async (req, res, next) => {
  try {
    const list = await callback((done) => shares.list(usernameOf(req), done));
    const answer = await Promise.all(list.map(async (share) => ({
      token: share.token,
      title: share.title,
      count: (await presentImages(share)).length,
      created: share.created,
      expires: share.expires || null,
      expired: expired(share),
      views: share.views || 0,
    })));
    res.set('Cache-Control', 'no-cache');
    res.json({ shares: answer });
  } catch (err) {
    next(err);
  }
});

owner.post('/', async (req, res, next) => {
  const username = usernameOf(req);
  const body = req.body || {};
  const paths = body.paths;
  if (!Array.isArray(paths) || !paths.length || paths.length > MAX_IMAGES || !paths.every((item) => typeof item === 'string' && item.trim())) {
    return res.status(400).json({ message: `paths must be a list of 1 to ${MAX_IMAGES} images of your uploads` });
  }
  const days = body.expiresInDays === undefined || body.expiresInDays === null ? 0 : Number(body.expiresInDays);
  if (!EXPIRIES.includes(days)) {
    return res.status(400).json({ message: `expiresInDays must be one of ${EXPIRIES.join(', ')} (0: never)` });
  }
  try {
    const existing = await callback((done) => shares.list(username, done));
    if (existing.length >= MAX_SHARES) {
      return res.status(400).json({ message: `You have ${MAX_SHARES} links already: revoke some first` });
    }
    // Only the images of his own uploads, each once
    const kept = [];
    for (const relative of [...new Set(paths)]) {
      if (await imageFile({ owner: username }, relative)) {
        kept.push(path.posix.normalize(relative.split(path.sep).join('/')));
      }
    }
    if (!kept.length) {
      return res.status(400).json({ message: 'None of these images is in your uploads' });
    }
    const title = String(body.title || '').trim().slice(0, MAX_TITLE) || `${kept.length} ${kept.length === 1 ? 'image' : 'images'}`;
    const now = Date.now();
    const share = {
      token: crypto.randomBytes(16).toString('base64url'),
      owner: username,
      title,
      paths: kept,
      created: now,
      expires: days ? now + days * DAY : null,
    };
    await callback((done) => shares.create(share, done));
    logger.info(`${username} shared ${kept.length} images (${share.token.slice(0, 4)}…)`);
    res.status(201).json({ token: share.token, title, count: kept.length, created: now, expires: share.expires, skipped: paths.length - kept.length });
  } catch (err) {
    next(err);
  }
});

owner.delete('/:token', async (req, res, next) => {
  const username = usernameOf(req);
  try {
    const share = TOKEN.test(req.params.token) ? await callback((done) => shares.get(req.params.token, done)) : null;
    if (!share || share.owner !== username) {
      return res.status(404).json({ message: 'No such link' });
    }
    await callback((done) => shares.remove(username, share.token, done));
    res.json({ message: 'revoked' });
  } catch (err) {
    next(err);
  }
});

// ---------- Everyone ----------

/** The share of the link, if it works; else answers 404 and resolves null */
async function openShare(req, res) {
  const share = TOKEN.test(req.params.token) ? await callback((done) => shares.get(req.params.token, done)) : null;
  if (!share || expired(share)) {
    res.status(404).json({ message: share ? 'This link has expired' : 'This link does not exist, or was revoked' });
    return null;
  }
  return share;
}

visitor.get('/:token', async (req, res, next) => {
  try {
    const share = await openShare(req, res);
    if (!share) {
      return;
    }
    const images = await presentImages(share);
    shares.countView(share.token, () => undefined);
    res.set({ 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    res.json({ title: share.title, owner: share.owner, created: share.created, expires: share.expires || null, images });
  } catch (err) {
    next(err);
  }
});

visitor.get('/:token/image/:index', async (req, res, next) => {
  try {
    const share = await openShare(req, res);
    if (!share) {
      return;
    }
    const index = Number(req.params.index);
    const relative = Number.isInteger(index) ? share.paths[index] : undefined;
    const found = relative !== undefined ? await imageFile(share, relative) : null;
    if (!found) {
      return res.status(404).json({ message: 'No such image' });
    }
    // Kept a little by the browser only: a revoked link stops working soon
    const headers = {
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    };
    if (req.query.size !== undefined) {
      const size = Number(req.query.size);
      if (!gallery.THUMB_SIZES.includes(size)) {
        return res.status(400).json({ message: `size must be one of ${gallery.THUMB_SIZES.join(', ')}` });
      }
      const thumb = await gallery.thumbnail(share.owner, found.file, found.stat, size).catch(() => null);
      if (!thumb) {
        return res.status(422).json({ message: 'No thumbnail can be made of this image' });
      }
      res.set({ ...headers, 'Content-Type': 'image/jpeg' });
      return res.sendFile(thumb, { cacheControl: false, dotfiles: 'allow' });
    }
    res.set({ ...headers, 'Content-Type': gallery.mimeOf(found.file) });
    if (req.query.download) {
      res.attachment(path.basename(found.file));
    }
    res.sendFile(found.file, { cacheControl: false }, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ message: 'The image cannot be read' });
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = { owner, visitor };
