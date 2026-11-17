const express = require('express');
const logger = require('log4js').getLogger('Books');

const library = require('../../middleware/library');
const books = require('../../middleware/books');
const searchText = require('../../middleware/search-text');
const reading = require('../../model/books');

/**
 * The books of the library (PDF and EPUB), read in the browser. Login required (see guards.js);
 * a private book (an upload) only for its owner.
 *
 * - GET /                  { books, scanning } (or ?q= to search), each with the `progress` of the member
 * - GET /:uid              one book
 * - GET /:uid/file         the file, by ranges (&download=1: as a download)
 * - GET /:uid/cover        its cover, a JPEG made once (422 when it has none)
 * - PUT /:uid/progress     { position, percent } where the member is in it; DELETE forgets it
 */
const router = express.Router();

/** A place in a book: a page number, or an EPUB CFI of a deeply nested paragraph */
const MAX_POSITION = 2000;

function usernameOf(req) {
  return req.session && req.session.passport && req.session.passport.user ? req.session.passport.user.username : null;
}

function byTitle(a, b) {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
    || a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base', numeric: true });
}

/** The book asked, or a 404 (unknown or private to someone else: the same answer) */
function found(req, res) {
  const entry = library.getBook(req.params.uid, usernameOf(req));
  if (!entry) {
    res.status(404).json({ message: 'Unknown book' });
  }
  return entry;
}

/** The reading positions of the member; none in desktop mode, which has no account */
function progressOf(username) {
  return new Promise((resolve) => {
    if (!username) {
      return resolve({});
    }
    reading.all(username, (err, all) => {
      if (err) {
        logger.warn(`The reading positions of ${username} could not be read: ${err.message}`);
      }
      resolve(all || {});
    });
  });
}

function withProgress(entry, all) {
  return Object.assign(books.publicBook(entry), { progress: all[entry.uid] || null });
}

router.get('/', async (req, res) => {
  const username = usernameOf(req);
  const list = library.booksFor(username).slice().sort(byTitle);
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const shown = searchText.isSearch(query)
    ? searchText.rank(list, query, (entry) => [{ value: entry.title, weight: 3 }, { value: entry.author || '', weight: 2 }, { value: entry.name, weight: 2 }, { value: entry.folder, weight: 1 }])
    : list;
  const all = await progressOf(username);
  res.set('Cache-Control', 'no-cache');
  res.json({ books: shown.map((entry) => withProgress(entry, all)), scanning: !!library.scanProgress });
});

router.get('/:uid', async (req, res) => {
  const entry = found(req, res);
  if (entry) {
    res.set('Cache-Control', 'no-cache');
    res.json(withProgress(entry, await progressOf(usernameOf(req))));
  }
});

router.get('/:uid/file', (req, res) => {
  const entry = found(req, res);
  if (!entry) {
    return;
  }
  // Read by the reader of the application, never shown as a page of its own: an EPUB holds
  // HTML, a PDF may hold scripts
  res.set({
    'Content-Type': entry.mime,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (req.query.download) {
    res.attachment(entry.name);
  }
  // send answers the ranges (206) the PDF reader asks for, and the conditional requests
  res.sendFile(entry.file, { cacheControl: false, dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      logger.warn(`Cannot send ${entry.file}: ${err.message}`);
      res.status(err.status === 416 ? 416 : 404).json({ message: 'The book cannot be read' });
    }
  });
});

router.get('/:uid/cover', (req, res) => {
  const entry = found(req, res);
  if (!entry) {
    return;
  }
  books.coverOf(entry).then((file) => {
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(file, { cacheControl: false, dotfiles: 'allow' });
  }).catch((err) => {
    logger.debug(`No cover for ${entry.file}: ${err.message}`);
    res.status(422).json({ message: 'This book has no cover' });
  });
});

router.put('/:uid/progress', (req, res) => {
  const entry = found(req, res);
  if (!entry) {
    return;
  }
  const username = usernameOf(req);
  if (!username) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const body = req.body || {};
  const percent = Number(body.percent);
  if (typeof body.position !== 'string' || !body.position || body.position.length > MAX_POSITION
    || typeof body.percent !== 'number' || !(percent >= 0 && percent <= 1)) {
    return res.status(400).json({ message: 'position (a text) and percent (from 0 to 1) are required' });
  }
  const progress = { position: body.position, percent: Math.round(percent * 10000) / 10000, updated: Date.now() };
  reading.set(username, entry.uid, progress, (err) => {
    if (err) {
      logger.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(progress);
  });
});

router.delete('/:uid/progress', (req, res) => {
  const entry = found(req, res);
  if (!entry) {
    return;
  }
  const username = usernameOf(req);
  if (!username) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  reading.remove(username, entry.uid, (err) => {
    if (err) {
      logger.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json({ message: 'ok' });
  });
});

module.exports = router;
