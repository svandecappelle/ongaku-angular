const express = require('express');
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const async = require("async");
const _ = require("underscore");
const getFolderSize = require('get-folder-size').default;
const getSize = (folder, callback) => getFolderSize.strict(folder).then((size) => callback(null, size), callback);

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const scanner = require("./../../middleware/scanner");

const userlib = require("./../../model/library");
const user = require("./../../model/user");
const db = require("./../../model/database");

const USERS_DIRECTORY = path.resolve(__dirname, '../../../../public/user');

var router = express.Router();


class Helpers {

    renderLibraryPage(username, req, res) {
        userlib.get(username, function (err, uids) {
            var libraryDatas = null;
            if (req.params.page === "all") {
                libraryDatas = library.getUserLibrary(uids, null, null, username, req.params.search);
            } else {
                libraryDatas = library.getUserLibrary(uids, req.params.page, 3, username, req.params.search);
            }

            middleware.json(req, res, libraryDatas);
        });
    };
}

var helpers = new Helpers();


function userStorage(username) {
    return new Promise((resolve, reject) => {
        let folder = path.resolve(__dirname, `../../../../public/user/${username}/imported`);
        if (!fs.existsSync(folder)) {
            resolve(0);
        } else {
            getSize(folder, (err, size) => {
                if (err) { throw err; }
                resolve(size);
            });
        }
    });
}

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
        uids: (next) => userlib.get(username, next),
        playlists: (next) => db.setCount(username + ':playlists', next),
        usage: (next) => userStorage(username).then((size) => next(null, size), () => next(null, 0)),
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
            self: self,
            administrator: !!data.administrator,
            tracks: artists.reduce((count, artist) => count + artist.tracks, 0),
            artistsCount: artists.length,
            playlists: parseInt(data.playlists, 10) || 0,
            uploads: { files: data.files, size: data.usage },
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

    var busboy = Busboy({ headers: req.headers });
    var saving = Promise.resolve();
    var rejected = false;
    busboy.on('file', function (fieldname, file, { mimeType }) {
        if (!/^image\//.test(mimeType)) {
            rejected = true;
            return file.resume();
        }
        var userdir = path.resolve(USERS_DIRECTORY, username);
        fs.mkdirSync(userdir, { recursive: true });
        // The image is written next to the previous one, which is replaced once complete
        var saveTo = path.resolve(userdir, type);
        var partial = saveTo + '.upload';
        saving = new Promise((resolve, reject) => {
            file.pipe(fs.createWriteStream(partial)).on('finish', resolve).on('error', reject);
        }).then(() => fs.promises.rename(partial, saveTo));
    });
    busboy.on('close', function () {
        saving.then(() => {
            if (rejected) {
                return res.status(400).json({ message: 'The file is not an image' });
            }
            res.json({ message: 'ok' });
        }, (err) => {
            console.error(err);
            res.status(500).json({ message: 'Internal server error' });
        });
    });

    req.pipe(busboy);
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

router.post('/library/add', (req, res) => {
    var username = req.session.passport.user.username,
        uids = req.body.elements;
    console.debug("append to user lib: ".concat(username).concat(" -> ").concat(uids));

    async.each(uids, (uid, next) => {
        userlib.append(username, uid, () => {
            console.debug("Appended to list: " + uid);
            next();
        });
    }, () => {
        console.debug("All elements added");
    });
    res.send({ message: "ok" });
});

router.post('/library/remove', (req, res) => {
    var username = req.session.passport.user.username,
        uids = req.body.elements;
    console.debug("remove to user lib: ".concat(username).concat(" -> ").concat(uids));

    async.each(uids, (uid, next) => {
        userlib.remove(username, uid, () => {
            console.debug("Remove from list: " + uid);
            next();
        });
    }, () => {
        console.debug("All elements removed");
    });
    res.send({ message: "ok" });
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