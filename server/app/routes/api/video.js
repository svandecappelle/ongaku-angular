const express = require('express');
const logger = require('log4js').getLogger('Video');

const library = require('../../middleware/library');
const video = require('../../middleware/video');
const searchText = require('../../middleware/search-text');

/**
 * The videos of the library: GET / (all, or ?q= to search), GET /:uid, GET /:uid/stream (the
 * file, by ranges for seeking), GET /:uid/poster (a frame, made once). Login required (see
 * guards.js); a private video only for its owner.
 */
const router = express.Router();

function usernameOf(req) {
  return req.session && req.session.passport && req.session.passport.user ? req.session.passport.user.username : null;
}

function byTitle(a, b) {
  return a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base', numeric: true })
    || a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
}

/** The video asked, or a 404 (unknown or private to someone else: the same answer) */
function found(req, res) {
  const entry = library.getVideo(req.params.uid, usernameOf(req));
  if (!entry) {
    res.status(404).json({ message: 'Unknown video' });
  }
  return entry;
}

router.get('/', (req, res) => {
  const videos = library.videosFor(usernameOf(req)).slice().sort(byTitle);
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const shown = searchText.isSearch(query)
    ? searchText.rank(videos, query, (entry) => [{ value: entry.title, weight: 3 }, { value: entry.name, weight: 2 }, { value: entry.folder, weight: 1 }])
    : videos;
  res.json({ videos: shown.map(video.publicVideo), scanning: !!library.scanProgress });
});

router.get('/:uid', (req, res) => {
  const entry = found(req, res);
  if (entry) {
    res.json(video.publicVideo(entry));
  }
});

router.get('/:uid/stream', (req, res) => {
  const entry = found(req, res);
  if (!entry) {
    return;
  }
  // send answers the ranges (206) the players ask for to seek, and the conditional requests
  res.sendFile(entry.file, { headers: { 'Content-Type': entry.mime }, cacheControl: false, dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      logger.warn(`Cannot stream ${entry.file}: ${err.message}`);
      res.status(err.status === 416 ? 416 : 404).json({ message: 'The video cannot be read' });
    }
    // Once sending: the player stopped reading (seek, page left), nothing to tell
  });
});

router.get('/:uid/poster', (req, res) => {
  const entry = found(req, res);
  if (!entry) {
    return;
  }
  video.posterOf(entry).then((file) => {
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(file, { dotfiles: 'allow' });
  }).catch((err) => {
    logger.warn(`No poster for ${entry.file}: ${err.message}`);
    res.status(422).json({ message: 'No image can be taken from this video' });
  });
});

module.exports = router;
