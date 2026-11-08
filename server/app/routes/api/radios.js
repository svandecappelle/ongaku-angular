const express = require('express');
const crypto = require('crypto');

const middleware = require('./../../middleware/middleware');
const radioStream = require('./../../middleware/radio-stream');
const libraryRadio = require('./../../middleware/library-radio');
const radios = require('./../../model/radios');
const user = require('./../../model/user');

const MAX_NAME = 80;
const MAX_GENRE = 40;

/** Last title sent by each station, seen by the listeners' streams: id -> { title, at } */
const onAir = new Map();

var router = express.Router();

router.use((req, res, next) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    req.username = req.session.passport.user.username;
    req.uid = req.session.passport.user.uid;
    next();
});

function administratorsOnly(req, res, next) {
    user.isAdministrator(req.uid, (err, administrator) => {
        if (err || !administrator) {
            return res.status(403).json({ message: 'Administrators only' });
        }
        next();
    });
}

function failed(res, err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
}

/** The fields of a station sent by an administrator, or a message saying what is wrong */
function stationFields(body) {
    const name = String((body && body.name) || '').trim();
    const genre = String((body && body.genre) || '').trim();
    const url = radioStream.streamUrl(body && body.url);
    if (!name || name.length > MAX_NAME) {
        return { error: `The name is required (${MAX_NAME} characters at most)` };
    }
    if (genre.length > MAX_GENRE) {
        return { error: `The genre is too long (${MAX_GENRE} characters at most)` };
    }
    if (!url) {
        return { error: 'The stream address must start with http:// or https://' };
    }
    return { name, genre: genre || null, url };
}

/** What the members see of a station; the address is for the administrators, who edit it */
function publicStation(station, favourites, administrator) {
    const live = onAir.get(station.id);
    return {
        id: station.id,
        name: station.name,
        genre: station.genre || null,
        type: station.type || null,
        bitrate: station.bitrate || null,
        url: administrator ? station.url : undefined,
        favourite: favourites.has(station.id),
        nowPlaying: live ? live.title : null
    };
}

/** The stations, by name, with the favourites of the connected user */
router.get('/', (req, res) => {
    radios.list((err, stations) => {
        if (err) {
            return failed(res, err);
        }
        radios.favourites(req.username, (err, ids) => {
            if (err) {
                return failed(res, err);
            }
            user.isAdministrator(req.uid, (err, administrator) => {
                const favourites = new Set(ids);
                res.json({
                    administrator: !err && !!administrator,
                    stations: stations.map((station) => publicStation(station, favourites, !err && !!administrator))
                });
            });
        });
    });
});

/** The stations made from the library of the connected user: [{ kind, seed, name, text }] */
router.get('/library', (req, res) => {
    libraryRadio.stations(req.username).then((stations) => res.json({ stations: stations })).catch((err) => failed(res, err));
});

/**
 * The next tracks of a library station: ?seed= (the artist or the genre) and ?exclude= (uids
 * the station already queued, comma separated). Each track carries the reason it was picked.
 */
router.get('/library/:kind/tracks', (req, res) => {
    const kind = req.params.kind;
    const seed = typeof req.query.seed === 'string' ? req.query.seed.slice(0, 200) : null;
    if (!libraryRadio.KINDS.includes(kind)) {
        return res.status(404).json({ message: 'Unknown station' });
    }
    if ((kind === 'artist' || kind === 'genre') && !seed) {
        return res.status(400).json({ message: 'seed is required for this station' });
    }
    const exclude = typeof req.query.exclude === 'string' ? req.query.exclude.split(',').filter(Boolean).slice(0, 500) : [];
    libraryRadio.nextTracks(req.username, kind, seed, exclude).then((tracks) => res.json({ tracks: tracks })).catch((err) => failed(res, err));
});

/** Tests a stream address before adding it: { url } -> { url, type, name, genre, bitrate, title } */
router.post('/test', administratorsOnly, (req, res) => {
    const url = radioStream.streamUrl(req.body && req.body.url);
    if (!url) {
        return res.status(400).json({ message: 'The stream address must start with http:// or https://' });
    }
    radioStream.probe(url).then((info) => res.json(info)).catch((err) => {
        if (err instanceof radioStream.StreamError) {
            return res.status(400).json({ message: err.message });
        }
        failed(res, err);
    });
});

/** Saves a station after testing its stream; the address kept is the stream's (after a playlist) */
function saveStation(req, res, station) {
    const fields = stationFields(req.body);
    if (fields.error) {
        return res.status(400).json({ message: fields.error });
    }
    radioStream.probe(fields.url).then((info) => {
        Object.assign(station, { name: fields.name, genre: fields.genre, url: info.url, type: info.type, bitrate: info.bitrate });
        radios.save(station, (err) => {
            if (err) {
                return failed(res, err);
            }
            res.json(publicStation(station, new Set(), true));
        });
    }).catch((err) => {
        if (err instanceof radioStream.StreamError) {
            return res.status(400).json({ message: `The stream does not play: ${err.message}` });
        }
        failed(res, err);
    });
}

/** Adds a station for every member: { name, url, genre } */
router.post('/', administratorsOnly, (req, res) => {
    saveStation(req, res, { id: crypto.randomBytes(6).toString('hex'), createdBy: req.username, createdAt: Date.now() });
});

router.put('/:id', administratorsOnly, (req, res) => {
    radios.get(req.params.id, (err, station) => {
        if (err) {
            return failed(res, err);
        }
        if (!station) {
            return res.status(404).json({ message: 'Unknown station' });
        }
        saveStation(req, res, station);
    });
});

router.delete('/:id', administratorsOnly, (req, res) => {
    radios.get(req.params.id, (err, station) => {
        if (err) {
            return failed(res, err);
        }
        if (!station) {
            return res.status(404).json({ message: 'Unknown station' });
        }
        radios.remove(station.id, (err) => {
            if (err) {
                return failed(res, err);
            }
            onAir.delete(station.id);
            res.json({ message: 'ok' });
        });
    });
});

/** Marks a station as favourite of the connected user, or not: { favourite } */
router.put('/:id/favourite', (req, res) => {
    if (typeof (req.body && req.body.favourite) !== 'boolean') {
        return res.status(400).json({ message: 'favourite must be true or false' });
    }
    radios.get(req.params.id, (err, station) => {
        if (err) {
            return failed(res, err);
        }
        if (!station) {
            return res.status(404).json({ message: 'Unknown station' });
        }
        radios.setFavourite(req.username, station.id, req.body.favourite, (err) => {
            if (err) {
                return failed(res, err);
            }
            res.json({ favourite: req.body.favourite });
        });
    });
});

/** The title the station is playing, as sent in its stream (null: none seen, or not sent) */
router.get('/:id/now', (req, res) => {
    const live = onAir.get(req.params.id);
    res.json({ title: live ? live.title : null, since: live ? live.at : null });
});

/**
 * The audio of a station, through the server: the page plays it from its own origin (the player
 * analyses the sound, which browsers refuse for other origins without CORS, and an http stream
 * would be blocked on an https page). The metadata is removed from the audio; its titles feed /now.
 */
router.get('/:id/stream', (req, res) => {
    radios.get(req.params.id, (err, station) => {
        if (err) {
            return failed(res, err);
        }
        if (!station) {
            return res.status(404).json({ message: 'Unknown station' });
        }
        const listener = new AbortController();
        res.on('close', () => listener.abort());
        radioStream.open(station.url, listener.signal).then((opened) => {
            if (listener.signal.aborted) {
                return opened.controller.abort();
            }
            res.status(200).set({
                'Content-Type': radioStream.playableType(radioStream.describe(opened.response).type),
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff'
            });
            const audio = radioStream.audioStream(opened.response, (title) => {
                onAir.set(station.id, { title: title, at: Date.now() });
            });
            listener.signal.addEventListener('abort', () => {
                opened.controller.abort();
                audio.destroy();
            }, { once: true });
            audio.on('error', () => res.destroy());
            audio.pipe(res);
        }).catch((err) => {
            if (listener.signal.aborted) {
                return;
            }
            if (err instanceof radioStream.StreamError) {
                return res.status(502).json({ message: err.message });
            }
            failed(res, err);
        });
    });
});

module.exports = router;
