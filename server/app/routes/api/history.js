const express = require('express');
const moment = require('moment');

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const history = require("./../../model/history");
const user = require("./../../model/user");

/** Days of the listening chart, today included */
const CHART_DAYS = 7;
const TOP_ARTISTS = 5;
/** A play of the same track sooner than this after the last one is the same play reported twice */
const REPEAT_DELAY = 30 * 1000;
/** Recent plays read to build the list of recently played tracks */
const RECENT_SCAN = 500;

var router = express.Router();

router.use((req, res, next) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    req.username = req.session.passport.user.username;
    req.uid = req.session.passport.user.uid;
    next();
});

/** Track shown for a uid, when the user may see it */
function visibleTrack(uid, username) {
    const track = library.getVisibleByUid(uid);
    return track && (!track.private || track.user === username) ? track : null;
}

/** Seconds of a library duration ("m:ss") */
function seconds(duration) {
    const parts = String(duration || '').split(':').map((part) => parseInt(part, 10));
    if (parts.some((part) => isNaN(part))) {
        return 0;
    }
    return parts.reduce((total, part) => total * 60 + part, 0);
}

function isPaused(uid, callback) {
    user.getUserField(uid, 'pauseHistory', (err, value) => callback(err, String(value) === '1'));
}

function failed(res, err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
}

/**
 * The player reports a track listened to long enough (30 seconds, or the whole track when shorter): { uid }.
 * Nothing is recorded while the user has paused the history.
 */
router.post('/plays', (req, res) => {
    const uid = req.body && req.body.uid;
    if (typeof uid !== 'string' || !uid) {
        return res.status(400).json({ message: 'uid must be a track uid' });
    }
    const track = visibleTrack(uid, req.username);
    if (!track) {
        return res.status(404).json({ message: 'Unknown track' });
    }
    isPaused(req.uid, (err, paused) => {
        if (err) {
            return failed(res, err);
        }
        if (paused) {
            return res.json({ recorded: false });
        }
        history.recent(req.username, 1, (err, last) => {
            if (err) {
                return failed(res, err);
            }
            const now = moment();
            if (last.length && last[0].uid === track.uid && now.valueOf() - last[0].at < REPEAT_DELAY) {
                return res.json({ recorded: false });
            }
            const artist = String(track.artist || '').trim();
            history.add(req.username, {
                uid: track.uid,
                at: now.valueOf(),
                month: now.format('YYYY-MM'),
                day: now.format('YYYY-MM-DD'),
                seconds: seconds(track.duration),
                artist: artist && artist !== 'undefined' ? artist : null
            }, (err) => {
                if (err) {
                    return failed(res, err);
                }
                res.json({ recorded: true });
            });
        });
    });
});

/** Tracks played lately, the latest first, each once, with the time of its last play (`playedAt`, ms): ?limit= (20, at most 100) */
router.get('/', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    isPaused(req.uid, (err, paused) => {
        if (err) {
            return failed(res, err);
        }
        history.recent(req.username, RECENT_SCAN, (err, plays) => {
            if (err) {
                return failed(res, err);
            }
            const seen = new Set();
            const tracks = [];
            for (const play of plays) {
                // Deleted or hidden tracks are left out; a hidden duplicate shows as the copy kept
                const track = visibleTrack(play.uid, req.username);
                if (track && !seen.has(track.uid)) {
                    seen.add(track.uid);
                    tracks.push(Object.assign({}, track, { playedAt: play.at }));
                    if (tracks.length === limit) {
                        break;
                    }
                }
            }
            res.json({ paused: paused, tracks: tracks });
        });
    });
});

/**
 * Listening figures of the connected user: plays and listening time this month, top artists
 * of the month, plays of each of the last 7 days (oldest first).
 */
router.get('/stats', (req, res) => {
    const now = moment();
    const month = now.format('YYYY-MM');
    isPaused(req.uid, (err, paused) => {
        if (err) {
            return failed(res, err);
        }
        history.counters(req.username, (err, counters) => {
            if (err) {
                return failed(res, err);
            }
            history.topArtists(req.username, month, TOP_ARTISTS, (err, artists) => {
                if (err) {
                    return failed(res, err);
                }
                const count = (field) => parseInt(counters[field], 10) || 0;
                const days = [];
                for (let i = CHART_DAYS - 1; i >= 0; i--) {
                    const date = now.clone().subtract(i, 'days').format('YYYY-MM-DD');
                    days.push({ date: date, plays: count('day:' + date) });
                }
                res.json({
                    paused: paused,
                    month: { month: month, plays: count('plays:' + month), seconds: count('seconds:' + month) },
                    total: Object.keys(counters).filter((field) => field.indexOf('plays:') === 0).reduce((total, field) => total + count(field), 0),
                    topArtists: artists.map((entry) => ({ name: entry.value, plays: parseInt(entry.score, 10) || 0 })),
                    days: days
                });
            });
        });
    });
});

/** Pauses or resumes the recording of the history: { paused } */
router.put('/settings', (req, res) => {
    if (typeof (req.body && req.body.paused) !== 'boolean') {
        return res.status(400).json({ message: 'paused must be true or false' });
    }
    user.setUserField(req.uid, 'pauseHistory', req.body.paused ? 1 : 0, (err) => {
        if (err) {
            return failed(res, err);
        }
        res.json({ paused: req.body.paused });
    });
});

/** Forgets the whole history of the connected user */
router.delete('/', (req, res) => {
    history.clear(req.username, (err) => {
        if (err) {
            return failed(res, err);
        }
        res.json({ message: 'ok' });
    });
});

module.exports = router;
