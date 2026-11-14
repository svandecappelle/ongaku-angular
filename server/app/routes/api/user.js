const express = require('express');
const fs = require('fs');
const path = require('path');
const async = require("async");
const _ = require("underscore");

const library = require("./../../middleware/library");
const importer = require("./../../middleware/importer");
const images = require("./../../middleware/images");
const middleware = require("./../../middleware/middleware");
const scanner = require("./../../middleware/scanner");
const quota = require("./../../middleware/quota");
const communication = require("./../../communication");
const searchText = require("./../../middleware/search-text");

const userlib = require("./../../model/library");
const likes = require("./../../model/likes");
const user = require("./../../model/user");
const db = require("./../../model/database");

const USERS_DIRECTORY = path.resolve(__dirname, '../../../../public/user');

var router = express.Router();


class Helpers {

    renderLibraryPage(username, req, res) {
        // Private uploads are matched by the username: only for the user himself
        const owner = middleware.isAuthenticated(req) && req.session.passport.user.username === username ? username : null;
        userlib.get(username, function (err, uids) {
            var libraryDatas = null;
            if (req.params.page === "all") {
                libraryDatas = library.getUserLibrary(uids, null, null, owner, req.params.search);
            } else {
                libraryDatas = library.getUserLibrary(uids, req.params.page, 3, owner, req.params.search);
            }

            middleware.json(req, res, libraryDatas);
        });
    };
}

var helpers = new Helpers();



// Number of artists of the profile library shown on the profile page
const PROFILE_ARTISTS = 12;

/**
 * Profile of a user. The e-mail (the uid) and the private uploads are only
 * given to the user himself.
 */
function profile(uid, username, self, callback) {
    async.parallel({
        administrator: (next) => user.isAdministrator(uid, next),
        email: (next) => self ? user.getUserField(uid, 'email', next) : next(null, undefined),
        hideListening: (next) => self ? user.getUserField(uid, 'hideListening', next) : next(null, undefined),
        uids: (next) => userlib.get(username, next),
        playlists: (next) => db.setCount(username + ':playlists', next),
        likes: (next) => likes.count(username, next),
        usage: (next) => quota.usage(username).then((size) => next(null, size)),
        quota: (next) => self ? quota.limit(uid, next) : next(null, null),
        files: (next) => scanner.files(path.resolve(USERS_DIRECTORY, username, 'imported'))
            .then((files) => next(null, files.length), () => next(null, 0))
    }, (err, data) => {
        if (err) {
            return callback(err);
        }
        // Private tracks are matched by the username: only for the user himself
        const artists = library.getUserLibrary(data.uids || [], null, null, self ? username : null)
            .map((artist) => ({
                name: artist.artist,
                albums: artist.albums.length,
                tracks: artist.albums.reduce((count, album) => count + album.tracks.length, 0)
            }))
            .filter((artist) => artist.name && artist.name !== 'undefined');
        callback(null, {
            username: username,
            email: data.email,
            // Setting of the user himself: the others see what he plays
            shareListening: self ? String(data.hideListening) !== '1' : undefined,
            self: self,
            administrator: !!data.administrator,
            tracks: artists.reduce((count, artist) => count + artist.tracks, 0),
            artistsCount: artists.length,
            playlists: parseInt(data.playlists, 10) || 0,
            likes: parseInt(data.likes, 10) || 0,
            // The quota (bytes, null: unlimited) is only given to the user himself
            uploads: { files: data.files, size: data.usage, quota: data.quota ? data.quota.quota : undefined },
            artists: _.first(_.sortBy(artists, (artist) => -artist.tracks), PROFILE_ARTISTS)
        });
    });
}

function sendProfile(req, res, username) {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    user.getUidByUsername(username, (err, uid) => {
        if (err || !uid) {
            return res.status(404).json({ message: 'Unknown user' });
        }
        profile(uid, username, uid === req.session.passport.user.uid, (err, output) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Internal server error' });
            }
            res.json(output);
        });
    });
}

// ---------- Uploaded files of the connected user ----------

function uploadsRoot(username) {
    const root = path.resolve(USERS_DIRECTORY, username, 'imported');
    fs.mkdirSync(root, { recursive: true });
    return root;
}

// Absolute path of a path relative to the uploads folder, null when it leaves it
function insideUploads(username, relative) {
    const root = uploadsRoot(username);
    const target = path.resolve(root, String(relative || '.'));
    return target === root || target.startsWith(root + path.sep) ? target : null;
}

// Rescan of the private library of a user; resolves when done (or after 30s: the scan
// calls back only when the folder holds media)
function rescanUser(username) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 30000);
        library.addFolder({ path: path.resolve(USERS_DIRECTORY, username), username: username, private: true }, () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

function withUploadsPath(req, res, callback) {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const username = req.session.passport.user.username;
    const target = insideUploads(username, req.query.path);
    if (!target) {
        return res.status(400).json({ message: 'Invalid path' });
    }
    callback(username, target, path.relative(uploadsRoot(username), target).split(path.sep).join('/'));
}

/** Files shown by page in the uploads view */
const FILES_PAGE = 50;
const MAX_FILES_PAGE = 200;
const NAME_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * A folder of the uploads, by page: ?page= (from 0), ?size= (50, at most 200) and ?q= (part of
 * the name, ignoring case and accents). Folders first, then by name; only the files of the page
 * are read for their size and date. { path, files, total, page, size }
 */
router.get('/files', (req, res) => {
    withUploadsPath(req, res, (username, target, relative) => {
        fs.readdir(target, { withFileTypes: true }, (err, entries) => {
            if (err) {
                return res.status(err.code === 'ENOENT' ? 404 : 500).json({ message: err.code === 'ENOENT' ? 'No such folder' : 'Internal server error' });
            }
            const size = Math.min(Math.max(parseInt(req.query.size, 10) || FILES_PAGE, 1), MAX_FILES_PAGE);
            const query = typeof req.query.q === 'string' ? searchText.normalize(req.query.q).trim() : '';
            // Folders first; accents in their place, "track 2" before "track 10"
            const visible = entries
                .filter((entry) => !entry.name.startsWith('.') && (!query || searchText.normalize(entry.name).includes(query)))
                .sort((a, b) => (b.isDirectory() - a.isDirectory()) || NAME_ORDER.compare(a.name, b.name));
            const pages = Math.max(1, Math.ceil(visible.length / size));
            // Past the end (files deleted meanwhile): the last page
            const page = Math.min(Math.max(parseInt(req.query.page, 10) || 0, 0), pages - 1);
            Promise.all(visible.slice(page * size, (page + 1) * size).map((entry) => fs.promises.stat(path.join(target, entry.name))
                .then((stat) => stat, () => null)
                .then((stat) => ({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: entry.isDirectory() || !stat ? null : stat.size,
                    modified: stat ? stat.mtimeMs : null,
                    audio: !entry.isDirectory() && importer.isAudio(entry.name),
                    video: !entry.isDirectory() && importer.isVideo(entry.name)
                })))).then((files) => {
                res.json({ path: relative, files: files, total: visible.length, page: page, size: size });
            });
        });
    });
});

router.post('/files/folder', (req, res) => {
    withUploadsPath(req, res, (username, target) => {
        const name = String(req.body.name || '').trim();
        if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..' || name.startsWith('.')) {
            return res.status(400).json({ message: 'Invalid folder name' });
        }
        fs.mkdir(path.join(target, name), (err) => {
            if (err) {
                return res.status(err.code === 'EEXIST' ? 409 : 500).json({ message: err.code === 'EEXIST' ? 'This folder already exists' : 'Internal server error' });
            }
            res.json({ message: 'created' });
        });
    });
});

router.delete('/files', (req, res) => {
    withUploadsPath(req, res, (username, target, relative) => {
        if (!relative) {
            return res.status(400).json({ message: 'The uploads folder itself cannot be deleted' });
        }
        fs.rm(target, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Internal server error' });
            }
            rescanUser(username).then(() => res.json({ message: 'deleted' }));
        });
    });
});

/** Items deleted at once at most: a page of the uploads view holds 200 */
const MAX_DELETED = 1000;

/**
 * Deletes several files and folders of the uploads at once: { paths: [relative paths] } ->
 * { deleted: [paths], failed: [{ path, message }] }. The library is read again once.
 */
router.post('/files/delete', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const paths = req.body && req.body.paths;
    if (!Array.isArray(paths) || !paths.length || paths.length > MAX_DELETED || !paths.every((item) => typeof item === 'string' && item.trim())) {
        return res.status(400).json({ message: `paths must be a list of 1 to ${MAX_DELETED} paths of your uploads` });
    }
    const username = req.session.passport.user.username;
    const root = uploadsRoot(username);
    const deleted = [];
    const failed = [];
    // A folder and a file inside it may both be chosen: the folder takes the file along
    const targets = [...new Set(paths)].map((relative) => ({ relative, target: insideUploads(username, relative) }));
    async.eachSeries(targets, ({ relative, target }, next) => {
        if (!target || target === root) {
            failed.push({ path: relative, message: target === root ? 'The uploads folder itself cannot be deleted' : 'Invalid path' });
            return next();
        }
        fs.rm(target, { recursive: true, force: false }, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.error(`Cannot delete ${target}`, err.message);
                failed.push({ path: relative, message: 'The file could not be deleted' });
            } else if (err && !targets.some((other) => other.target && other.target !== target && target.startsWith(other.target + path.sep))) {
                failed.push({ path: relative, message: 'No such file' });
            } else {
                deleted.push(relative);
            }
            next();
        });
    }, () => {
        if (!deleted.length) {
            return res.status(failed.length ? 400 : 200).json({ deleted, failed });
        }
        rescanUser(username).then(() => res.json({ deleted, failed }));
    });
});

router.post('/files/upload', (req, res) => {
    withUploadsPath(req, res, (username, target) => {
        if (!fs.existsSync(target)) {
            return res.status(404).json({ message: 'No such folder' });
        }
        quota.check(req, res, username, (remaining) => {
            importer.receive(req, target, remaining).then((results) => {
                rescanUser(username).then(() => res.json({ message: 'ok', files: results }));
            });
        });
    });
});

/** Upload quota of the connected user: { used, quota, remaining } in bytes (null: unlimited) */
router.get('/quota', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const { uid, username } = req.session.passport.user;
    quota.status(uid, username, (err, status) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        res.json({ used: status.used, quota: status.quota, remaining: status.remaining });
    });
});

// Uids of the tracks the connected user added to his library
router.get('/library/uids', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    userlib.get(req.session.passport.user.username, (err, uids) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        // With the copies shown for the hidden duplicates the user saved
        res.json(withCanonicalUids(uids));
    });
});

// Library of the connected user (added tracks and private uploads), by album
router.get('/library/content', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const username = req.session.passport.user.username;
    userlib.get(username, (err, uids) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        const albums = [];
        library.getUserLibrary(uids || [], null, null, username).forEach((artist) => {
            artist.albums.forEach((album) => albums.push({
                artist: artist.artist,
                title: album.title,
                cover: album.cover,
                tracks: album.tracks
            }));
        });
        res.json({ albums: albums, uids: withCanonicalUids(uids) });
    });
});

/** Whether the other members see what the connected user plays: { share } */
router.put('/settings/listening', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    if (typeof (req.body && req.body.share) !== 'boolean') {
        return res.status(400).json({ message: 'share must be true or false' });
    }
    const { uid, username } = req.session.passport.user;
    user.setUserField(uid, 'hideListening', req.body.share ? 0 : 1, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        communication.setHidden(username, !req.body.share);
        res.json({ share: req.body.share });
    });
});

router.get('/me', (req, res) => {
    sendProfile(req, res, middleware.isAuthenticated(req) ? req.session.passport.user.username : null);
});

router.get('/:username', (req, res) => {
    sendProfile(req, res, req.params.username);
});

router.post(['/image/:type'], (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    var username = req.session.passport.user.username;
    var type = req.params.type;
    if (type !== 'avatar' && type !== 'cover' && type !== 'background') {
        return res.status(403).json({
            message: 'Forbidden'
        });
    }

    images.receiveImage(req, path.resolve(USERS_DIRECTORY, username, type)).then((saved) => {
        if (!saved) {
            return res.status(400).json({ message: 'The file is not an image' });
        }
        res.json({ message: 'ok' });
    }, (err) => {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    });
});


router.delete('/image/:type', (req, res) => {
    var username = req.session.passport.user.username;
    var type = req.params.type;
    if (type !== 'avatar' && type !== 'cover' && type !== 'background') {
        return res.status(403).json({
            message: 'Forbidden'
        });
    }

    middleware.resetImageFile(username, type, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                message: 'Internal server error'
            });
        }
        res.json({ message: 'ok' });
    });
});

router.get('/image/:type', (req, res) => {
    if (!req.session.passport || !req.session.passport.user) {
        return res.status(403).json({
            message: 'You need to be logged'
        });
    }
    let username = req.session.passport.user.username;
    let type = req.params.type;
    if (type !== 'avatar' && type !== 'cover' && type !== 'background') {
        return res.status(403).json({
            message: 'Forbidden'
        });
    }
    // The default image is generated on the first request: wait for it before sending
    middleware.ensureImageFile(username, type, () => {
        res.sendFile(path.resolve(USERS_DIRECTORY, username, type), (err) => {
            if (err && !res.headersSent) {
                res.status(404).json({ message: 'No image' });
            }
        });
    });
});

/** Saved uids, plus the uid of the copy shown for each hidden duplicate */
function withCanonicalUids(uids) {
    return Array.from(new Set((uids || []).concat((uids || []).map((uid) => library.canonicalUid(uid)))));
}

function changeLibrary(req, res, change, extra) {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const username = req.session.passport.user.username;
    const uids = req.body.elements;
    if (!Array.isArray(uids) || !uids.every((uid) => typeof uid === 'string')) {
        return res.status(400).json({ message: 'elements must be a list of track uids' });
    }
    async.each(uids.concat(extra || []), (uid, next) => change(username, uid, () => next()), () => {
        res.send({ message: "ok" });
    });
}

router.post('/library/add', (req, res) => {
    changeLibrary(req, res, (username, uid, next) => userlib.append(username, uid, next));
});

router.post('/library/remove', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    // A shown track may stand for hidden duplicates saved earlier: they go too
    userlib.get(req.session.passport.user.username, (err, saved) => {
        const shown = Array.isArray(req.body.elements) ? new Set(req.body.elements) : new Set();
        const hidden = (saved || []).filter((uid) => !shown.has(uid) && shown.has(library.canonicalUid(uid)));
        changeLibrary(req, res, (username, uid, next) => userlib.remove(username, uid, next), hidden);
    });
});


router.get('/:username/library/:page', (req, res) => {
    var username = req.params.username;
    helpers.renderLibraryPage(username, req, res);
});

router.get('/:username/library/filter/:search/:page', (req, res) => {
    console.debug("Search filtering audio library");
    var username = req.params.username;
    helpers.renderLibraryPage(username, req, res);
});


module.exports = router;