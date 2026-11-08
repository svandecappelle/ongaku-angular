const express = require('express');
const library = require("./../../middleware/library");
const lyrics = require("./../../middleware/lyrics");
const middleware = require("./../../middleware/middleware");
const user = require("./../../model/user");

var router = express.Router();

router.use((req, res, next) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    const { uid, username } = req.session.passport.user;
    req.username = username;
    user.isAdministrator(uid, (err, administrator) => {
        req.administrator = !err && !!administrator;
        next();
    });
});

/** The track of the URL when the user may see it (not a private upload of another user) */
function withTrack(req, res, callback) {
    const track = library.getByUid(req.params.uid);
    if (!track || (track.private && track.user !== req.username)) {
        return res.status(404).json({ message: 'No such track' });
    }
    callback(track);
}

function onlyAdministrators(req, res, next) {
    if (!req.administrator) {
        return res.status(403).json({ message: 'Only administrators can change the lyrics' });
    }
    next();
}

/** { source, lrc }: lrc is null when the track has no lyrics */
router.get('/:uid', (req, res) => {
    withTrack(req, res, (track) => res.json(lyrics.read(track)));
});

/** Saves the lyrics of a track (plain text or LRC): { lrc } */
router.put('/:uid', onlyAdministrators, (req, res) => {
    withTrack(req, res, (track) => {
        const lrc = req.body && req.body.lrc;
        if (typeof lrc !== 'string') {
            return res.status(400).json({ message: 'lrc must be a text' });
        }
        if (Buffer.byteLength(lrc, 'utf8') > lyrics.maxSize) {
            return res.status(413).json({ message: 'The lyrics are too long' });
        }
        try {
            lrc.trim() ? lyrics.write(track, lrc) : lyrics.remove(track);
        } catch (err) {
            console.error('Cannot save the lyrics', err);
            return res.status(500).json({ message: 'The lyrics could not be saved' });
        }
        res.json(lyrics.read(track));
    });
});

/** Removes the lyrics saved by the administrators: the file or tag ones show again */
router.delete('/:uid', onlyAdministrators, (req, res) => {
    withTrack(req, res, (track) => {
        lyrics.remove(track);
        res.json(lyrics.read(track));
    });
});

module.exports = router;
