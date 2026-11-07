const express = require('express');
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const likes = require("./../../model/likes");

var router = express.Router();

router.use((req, res, next) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    req.username = req.session.passport.user.username;
    next();
});

function isUidList(value) {
    return Array.isArray(value) && value.every((uid) => typeof uid === 'string');
}

/** Track shown for a uid, when the user may see it */
function visibleTrack(uid, username) {
    const track = library.getVisibleByUid(uid);
    return track && (!track.private || track.user === username) ? track : null;
}

function failed(res, err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
}

/** Liked uids, plus the copy shown for each hidden duplicate (see middleware/deduplicate.js) */
router.get('/uids', (req, res) => {
    likes.get(req.username, (err, entries) => {
        if (err) {
            return failed(res, err);
        }
        const uids = entries.map((entry) => entry.value);
        res.json(Array.from(new Set(uids.concat(uids.map((uid) => library.canonicalUid(uid))))));
    });
});

/** Liked tracks, most recently liked first, with the like time (`likedAt`, ms) */
router.get('/', (req, res) => {
    likes.get(req.username, (err, entries) => {
        if (err) {
            return failed(res, err);
        }
        const seen = new Set();
        const tracks = [];
        let missing = 0;
        entries.forEach((entry) => {
            const track = visibleTrack(entry.value, req.username);
            if (!track) {
                missing++;
            } else if (!seen.has(track.uid)) {
                // Two liked copies of the same music are shown once, at the latest like
                seen.add(track.uid);
                tracks.push(Object.assign({}, track, { likedAt: entry.score }));
            }
        });
        res.json({ tracks: tracks, missing: missing });
    });
});

router.post('/add', (req, res) => {
    const uids = req.body && req.body.elements;
    if (!isUidList(uids)) {
        return res.status(400).json({ message: 'elements must be a list of track uids' });
    }
    const tracks = Array.from(new Set(uids.map((uid) => visibleTrack(uid, req.username)).filter(Boolean).map((track) => track.uid)));
    likes.add(req.username, tracks, (err) => {
        if (err) {
            return failed(res, err);
        }
        res.json({ message: 'ok', added: tracks.length });
    });
});

router.post('/remove', (req, res) => {
    const uids = req.body && req.body.elements;
    if (!isUidList(uids)) {
        return res.status(400).json({ message: 'elements must be a list of track uids' });
    }
    likes.get(req.username, (err, entries) => {
        if (err) {
            return failed(res, err);
        }
        // A shown track may stand for hidden duplicates liked earlier: they go too
        const shown = new Set(uids);
        const hidden = entries.map((entry) => entry.value).filter((uid) => !shown.has(uid) && shown.has(library.canonicalUid(uid)));
        likes.remove(req.username, uids.concat(hidden), (err) => {
            if (err) {
                return failed(res, err);
            }
            res.json({ message: 'ok' });
        });
    });
});

module.exports = router;
