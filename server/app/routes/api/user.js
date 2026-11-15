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
const references = require("./../../model/database/redis/references");
const shares = require("./../../model/shares");
const likes = require("./../../model/likes");
const user = require("./../../model/user");
const db = require("./../../model/database");

const { USERS_DIRECTORY, uploadsRoot, insideUploads } = require("./../../middleware/uploads-path");

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
                    video: !entry.isDirectory() && importer.isVideo(entry.name),
                    image: !entry.isDirectory() && importer.isImage(entry.name)
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

// ---------- Re-arranging the uploads ----------

const MAX_FOLDERS = 5000;

/** A name for a file or a folder: no path, not hidden */
function validName(name) {
    return !!name && name.length <= 255 && !/[\\/]/.test(name) && name !== '.' && name !== '..' && !name.startsWith('.');
}

const relativeTo = (root, target) => path.relative(root, target).split(path.sep).join('/');

/**
 * Applies moves of files or folders of the uploads ([[old absolute path, new absolute path]],
 * already done on the disk): what the member saved follows his tracks (their uids come from
 * their paths), his public links follow his images, then his library is read again.
 */
function afterMoves(username, moves) {
    const root = uploadsRoot(username);
    const uidOf = (file) => require('crypto').createHash('sha1').update(file).digest('hex');
    const trackMoves = [];
    library.tracks.filter((track) => track.private && track.user === username).forEach((track) => {
        for (const [from, to] of moves) {
            if (track.file === from || String(track.file).startsWith(from + path.sep)) {
                trackMoves.push([track.uid, uidOf(to + track.file.slice(from.length))]);
                break;
            }
        }
    });
    const pathMoves = moves.map(([from, to]) => [relativeTo(root, from), relativeTo(root, to)]);
    return new Promise((resolve) => references.renameTracks(username, trackMoves, (err) => {
        if (err) {
            console.error('The saved tracks could not follow their files', err);
        }
        shares.renamePaths(username, pathMoves, (err) => {
            if (err) {
                console.error('The shared links could not follow their images', err);
            }
            rescanUser(username).then(resolve);
        });
    }));
}

/** Every folder of the uploads, for "Move to": { folders: ['', 'A', 'A/B'] } */
router.get('/files/folders', (req, res) => {
    withUploadsPath(req, res, (username) => {
        const root = uploadsRoot(username);
        const folders = [''];
        const walk = (dir) => {
            let entries = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch (err) {
                return;
            }
            entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
                .sort((a, b) => NAME_ORDER.compare(a.name, b.name))
                .forEach((entry) => {
                    if (folders.length < MAX_FOLDERS) {
                        folders.push(relativeTo(root, path.join(dir, entry.name)));
                        walk(path.join(dir, entry.name));
                    }
                });
        };
        walk(root);
        res.json({ folders });
    });
});

/**
 * Moves files and folders of the uploads into one of its folders: { paths, to } ->
 * { moved: [{ from, to }], failed: [{ path, message }] }. Nothing is replaced.
 */
router.post('/files/move', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const body = req.body || {};
    const paths = body.paths;
    if (!Array.isArray(paths) || !paths.length || paths.length > MAX_DELETED || !paths.every((item) => typeof item === 'string' && item.trim())
        || typeof body.to !== 'string') {
        return res.status(400).json({ message: `paths (1 to ${MAX_DELETED}) and to (a folder of your uploads) are required` });
    }
    const username = req.session.passport.user.username;
    const root = uploadsRoot(username);
    const destination = insideUploads(username, body.to);
    if (!destination || !fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
        return res.status(400).json({ message: 'No such folder in your uploads' });
    }
    const moved = [];
    const failed = [];
    const moves = [];
    for (const relative of [...new Set(paths)]) {
        const source = insideUploads(username, relative);
        if (!source || source === root || !fs.existsSync(source)) {
            failed.push({ path: relative, message: source === root ? 'The uploads folder itself cannot be moved' : 'No such file' });
            continue;
        }
        const target = path.join(destination, path.basename(source));
        if (target === source) {
            continue;
        }
        if (destination === source || destination.startsWith(source + path.sep)) {
            failed.push({ path: relative, message: 'A folder cannot go into itself' });
            continue;
        }
        if (fs.existsSync(target)) {
            failed.push({ path: relative, message: `“${path.basename(source)}” is already there` });
            continue;
        }
        try {
            fs.renameSync(source, target);
            moves.push([source, target]);
            moved.push({ from: relativeTo(root, source), to: relativeTo(root, target) });
        } catch (err) {
            console.error(`Cannot move ${source}`, err.message);
            failed.push({ path: relative, message: 'It could not be moved' });
        }
    }
    if (!moves.length) {
        return res.status(failed.length ? 400 : 200).json({ moved, failed });
    }
    afterMoves(username, moves).then(() => res.json({ moved, failed }));
});

/** Renames a file or a folder of the uploads, in its folder: { path, name } -> { path } */
router.post('/files/rename', (req, res) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(403).json({ message: 'You need to be logged' });
    }
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (typeof body.path !== 'string' || !body.path.trim() || !validName(name)) {
        return res.status(400).json({ message: 'A name without slashes, not starting with a dot' });
    }
    const username = req.session.passport.user.username;
    const root = uploadsRoot(username);
    const source = insideUploads(username, body.path);
    if (!source || source === root || !fs.existsSync(source)) {
        return res.status(404).json({ message: 'No such file' });
    }
    const target = path.join(path.dirname(source), name);
    if (target === source) {
        return res.json({ path: relativeTo(root, target) });
    }
    // Only the case changes ("song.MP3" -> "song.mp3"): the same file on some disks
    if (fs.existsSync(target) && target.toLowerCase() !== source.toLowerCase()) {
        return res.status(409).json({ message: `“${name}” is already there` });
    }
    try {
        fs.renameSync(source, target);
    } catch (err) {
        console.error(`Cannot rename ${source}`, err.message);
        return res.status(500).json({ message: 'It could not be renamed' });
    }
    afterMoves(username, [[source, target]]).then(() => res.json({ path: relativeTo(root, target) }));
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