const express = require('express');
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const playlist = require("./../../model/playlist");

const MAX_NAME_LENGTH = 100;
const MAX_TRACKS = 5000;
/** Covers shown on a playlist tile */
const MAX_COVERS = 4;

var router = express.Router();

router.use((req, res, next) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    req.username = req.session.passport.user.username;
    next();
});

/** Trimmed name, or null when it cannot be used */
function playlistName(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const name = value.trim();
    return name && name.length <= MAX_NAME_LENGTH && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

function isUidList(value) {
    return Array.isArray(value) && value.every((uid) => typeof uid === 'string');
}

/**
 * Tracks of the library for these uids, in the same order. Unknown tracks and the
 * private uploads of the other users are left out.
 */
function resolveTracks(uids, username) {
    // A hidden duplicate is shown as its kept copy
    uids = uids.map((uid) => library.canonicalUid(uid));
    const wanted = new Set(uids);
    const found = new Map();
    library.flatten.forEach((track) => {
        if (wanted.has(track.uid) && (!track.private || track.user === username)) {
            found.set(track.uid, track);
        }
    });
    // Two saved copies of the same music are shown once
    return Array.from(new Set(uids.filter((uid) => found.has(uid)))).map((uid) => found.get(uid));
}

/** Uids of the tracks that can be saved in a playlist: known, visible to the user, once each */
function playableUids(uids, username) {
    return Array.from(new Set(resolveTracks(uids, username).map((track) => track.uid)));
}

/** "m:ss" or "h:mm:ss" in seconds */
function durationOf(track) {
    return String(track.duration || '').split(':').reduce((total, part) => total * 60 + (parseInt(part, 10) || 0), 0);
}

function coverUrl(track) {
    return '/api/audio/static/covers/' + encodeURIComponent(track.artist || '') + '/' + encodeURIComponent(track.album || '') + '/cover.jpg';
}

function summary(name, tracks, updated) {
    const covers = [];
    tracks.forEach((track) => {
        const cover = coverUrl(track);
        if (covers.length < MAX_COVERS && track.album && !covers.includes(cover)) {
            covers.push(cover);
        }
    });
    return {
        name: name,
        count: tracks.length,
        duration: tracks.reduce((total, track) => total + durationOf(track), 0),
        covers: covers,
        updated: parseInt(updated, 10) || null
    };
}

/** Load the playlist named in the URL, or answer 404 */
function withPlaylist(req, res, callback) {
    const name = req.params.name;
    playlist.exists(req.username, name, (err, exists) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        if (!exists) {
            return res.status(404).json({ message: 'No such playlist' });
        }
        playlist.getPlaylistContent(req.username, name, (err, uids) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Internal server error' });
            }
            callback(name, uids);
        });
    });
}

function sendPlaylist(req, res, name, status, extra) {
    playlist.getPlaylistContent(req.username, name, (err, uids) => {
        playlist.getUpdated(req.username, (err2, updated) => {
            if (err || err2) {
                console.error(err || err2);
                return res.status(500).json({ message: 'Internal server error' });
            }
            const tracks = resolveTracks(uids, req.username);
            res.status(status || 200).json(Object.assign(summary(name, tracks, updated[name]), {
                tracks: tracks,
                // Tracks no longer in the library
                missing: uids.filter((uid) => !library.getByUid(uid)).length
            }, extra));
        });
    });
}

function failed(res) {
    return (err) => {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    };
}

router.get('/', (req, res) => {
    playlist.getPlaylists(req.username, (err, names) => {
        if (err) {
            return failed(res)(err);
        }
        playlist.getUpdated(req.username, (err, updated) => {
            if (err) {
                return failed(res)(err);
            }
            const result = [];
            let pending = (names || []).length;
            if (!pending) {
                return res.json([]);
            }
            names.forEach((name) => {
                playlist.getPlaylistContent(req.username, name, (err, uids) => {
                    result.push(summary(name, resolveTracks(err ? [] : uids, req.username), updated[name]));
                    if (--pending === 0) {
                        // Most recently changed first
                        result.sort((a, b) => (b.updated || 0) - (a.updated || 0) || a.name.localeCompare(b.name));
                        res.json(result);
                    }
                });
            });
        });
    });
});

router.post('/', (req, res) => {
    const name = playlistName(req.body && req.body.name);
    const uids = req.body && req.body.uids !== undefined ? req.body.uids : [];
    if (!name) {
        return res.status(400).json({ message: 'The name must have 1 to ' + MAX_NAME_LENGTH + ' characters' });
    }
    if (!isUidList(uids) || uids.length > MAX_TRACKS) {
        return res.status(400).json({ message: 'uids must be a list of track uids' });
    }
    playlist.exists(req.username, name, (err, exists) => {
        if (err) {
            return failed(res)(err);
        }
        if (exists) {
            return res.status(409).json({ message: 'A playlist with this name already exists' });
        }
        const tracks = playableUids(uids, req.username);
        playlist.create(req.username, name, tracks, (err) => {
            if (err) {
                return failed(res)(err);
            }
            sendPlaylist(req, res, name, 201);
        });
    });
});

router.get('/:name', (req, res) => {
    withPlaylist(req, res, (name) => sendPlaylist(req, res, name));
});

/** Rename the playlist (`name`) and/or replace its tracks (`uids`) */
router.put('/:name', (req, res) => {
    const body = req.body || {};
    const newName = body.name === undefined ? null : playlistName(body.name);
    if (body.name !== undefined && !newName) {
        return res.status(400).json({ message: 'The name must have 1 to ' + MAX_NAME_LENGTH + ' characters' });
    }
    if (body.uids !== undefined && (!isUidList(body.uids) || body.uids.length > MAX_TRACKS)) {
        return res.status(400).json({ message: 'uids must be a list of track uids' });
    }
    withPlaylist(req, res, (name) => {
        const replaceTracks = (target) => {
            if (body.uids === undefined) {
                return sendPlaylist(req, res, target);
            }
            const tracks = playableUids(body.uids, req.username);
            playlist.setTracks(req.username, target, tracks, (err) => {
                if (err) {
                    return failed(res)(err);
                }
                sendPlaylist(req, res, target);
            });
        };
        if (!newName || newName === name) {
            return replaceTracks(name);
        }
        playlist.exists(req.username, newName, (err, exists) => {
            if (err) {
                return failed(res)(err);
            }
            if (exists) {
                return res.status(409).json({ message: 'A playlist with this name already exists' });
            }
            playlist.rename(req.username, name, newName, (err) => {
                if (err) {
                    return failed(res)(err);
                }
                replaceTracks(newName);
            });
        });
    });
});

router.post('/:name/tracks', (req, res) => {
    const uids = req.body && req.body.uids;
    if (!isUidList(uids) || !uids.length) {
        return res.status(400).json({ message: 'uids must be a list of track uids' });
    }
    withPlaylist(req, res, (name, current) => {
        // A track is in a playlist once
        const saved = new Set(current.map((uid) => library.canonicalUid(uid)));
        const tracks = playableUids(uids, req.username).filter((uid) => !saved.has(uid));
        if (current.length + tracks.length > MAX_TRACKS) {
            return res.status(400).json({ message: 'A playlist holds at most ' + MAX_TRACKS + ' tracks' });
        }
        playlist.append(req.username, name, tracks, (err) => {
            if (err) {
                return failed(res)(err);
            }
            sendPlaylist(req, res, name, 200, { added: tracks.length });
        });
    });
});

router.delete('/:name', (req, res) => {
    withPlaylist(req, res, (name) => {
        playlist.remove(req.username, name, (err) => {
            if (err) {
                return failed(res)(err);
            }
            res.json({ message: 'ok' });
        });
    });
});

module.exports = router;
