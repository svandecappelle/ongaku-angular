/*jslint node: true */

const express = require('express');
const logger = require('log4js').getLogger("UsersRoutes");
const nconf = require("nconf");
const _ = require("underscore");
const path = require("path");
const ffmetadata = require("ffmetadata");
const https = require('https');
const fs = require('fs');
const async = require("async");
const crypto = require('crypto');

const library = require("./../../middleware/library");
const quota = require("./../../middleware/quota");
const middleware = require("./../../middleware/middleware");
const importer = require("./../../middleware/importer");
const meta = require("./../../meta");
const communication = require("./../../communication");
const statistics = require("./../../model/statistics");
const security = require("./../../model/security");
const user = require("./../../model/user");
// const translator = require("./../../middleware/translator");
const algorithm = 'aes-192-cbc';
const password = nconf.get('secret');
var router = express.Router();

try {
    const player = require("./../../middleware/desktop-player");
} catch (err) {
    logger.warn('Application cannot be used using desktop player.');
}

const DEFAULT_USERS__DIRECTORY = path.resolve(__dirname, "../../../../public/user/");
const DEFAULT_GROUP_BY = ['artist', 'album'];
const DEFAULT_SORT_BY = 'artist';
const userFilesOpts = {
    root: DEFAULT_USERS__DIRECTORY,
    dotfiles: 'deny',
    headers: {
        'x-timestamp': Date.now(),
        'x-sent': true
    }
};

const lights_themes = ["light"];
const key = crypto.scryptSync(password, 'salt', 24);
const iv = Buffer.alloc(16, 0);
const filesMap = {};

var rmdirAsync = function (path, callback) {

    fs.readdir(path, function (err, files) {
        if (err) {
            // Pass the error on to callback
            callback(err, []);
            return;
        }
        var wait = files.length,
            count = 0,
            folderDone = function (err) {
                count++;
                // If we cleaned out all the files, continue
                if (count >= wait || err) {
                    fs.rmdir(path, callback);
                }
            };
        // Empty directory to bail early
        if (!wait) {
            folderDone();
            return;
        }

        // Remove one or more trailing slash to keep from doubling up
        path = path.replace(/\/+$/, "");
        files.forEach(function (file) {
            var curPath = path + "/" + file;
            fs.lstat(curPath, function (err, stats) {
                if (err) {
                    callback(err, []);
                    return;
                }
                if (stats.isDirectory()) {
                    rmdirAsync(curPath, folderDone);
                } else {
                    fs.unlink(curPath, folderDone);
                }
            });
        });
    });
};

var rmRecurse = function (path, callback) {
    fs.lstat(path, function (err, stats) {
        if (stats.isDirectory()) {
            rmdirAsync(path, callback);
        } else {
            fs.unlink(path, callback);
        }
    });
};

var getStatistics = function (name, callback) {
    var statisticsValues = {};
    async.each(name, function (statistic, next) {
        statistics.get(statistic.name, function (err, values) {
            if (err) {
                next(err);
            }
            var entries = _.pairs(values);

            if (statistic.type === 'track') {
                // The plays of the hidden duplicates count for the copy shown
                var plays = {};
                _.each(entries, function (element) {
                    var uid = library.canonicalUid(element[0]);
                    plays[uid] = (plays[uid] || 0) + (parseInt(element[1]) || 0);
                });
                entries = _.map(plays, function (count, uid) {
                    var track = library.getByUid(uid);
                    if (track) {
                        track.plays = count;
                    }
                    return track;
                });
            } else {
                entries = _.map(entries, function (element) {
                    return { title: element[0], 'plays-genre': parseInt(element[1]) };
                });
            }

            entries = _.sortBy(entries, (entry) => {
                return entry ? parseInt(entry[statistic.name]) : -1;
            }).reverse();

            var lenght = 10;
            entries = _.first(_.compact(entries), lenght);
            statisticsValues[statistic.name] = entries;

            next();
        });
    }, function (err) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, statisticsValues);
        }
    });
};

class SuccessCall {

    json() {
        return {
            code: 200,
            message: "Success"
        };
    }

};
class Helpers {


    encrypt(text) {
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        cipher.setAutoPadding(true);
        var crypted = cipher.update(text.trim(), 'utf8', 'hex')
        crypted += cipher.final('hex');
        this.decrypt(crypted);
        return crypted.trim().replace(/[^\x20-\x7E]+/g, '');
    }

    decrypt(text) {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAutoPadding(false);
        var dec = decipher.update(text.trim(), 'hex', 'utf8')
        dec += decipher.final('utf8');
        return dec.trim().replace(/[^\x20-\x7E]+/g, '');
    }

    incrementPlays(mediauid, userSession) {
        if (mediauid) {
            mediauid = mediauid.replace(".mp3", '');
            statistics.set('plays', mediauid, 'increment', () => {
                logger.info(`set statistics: ${mediauid}`);
            });
            var media = library.getByUid(mediauid);
            logger.debug(media);
            var genre = media.metadatas.genre ? media.metadatas.genre : media.metadatas.GENRE;
            if (genre) {
                statistics.set('plays-genre', genre, 'increment', () => {
                    logger.debug("set statistics");
                });
            }
            // TODO communication change this.
            communication.emit(userSession, 'streaming-playing:started', {
                uuid: mediauid,
                encoding: library.getAudioById(mediauid).encoding
            });
        }
    }

    redirectIfNotAuthenticated(req, res, callback) {
        if (middleware.isAuthenticated(req)) {
            callback();
        } else {
            logger.warn("Anonymous access forbidden: authentication required.");
            middleware.redirect('/login', res);
        }
    };

    callIfAuthenticated(req, res, callback) {
        if (middleware.isAuthenticated(req)) {
            callback();
        } else {
            logger.warn("Call with Anonymous access is forbidden: authentication required.");
            middleware.json(req, res, { error: "Authentication required", code: "403" });
        }
    };

    checkingAuthorization(req, res, callback) {
        if (nconf.get('type') === 'desktop') {
            logger.info("desktop mode all access granted");
            callback();
        } else {
            meta.settings.getOne("global", "requireLogin", (err, curValue) => {
                if (err) {
                    logger.debug("userauth error checking");
                    middleware.redirect('/login', res);
                } else if (curValue === "true") {
                    logger.debug("userauth is required to listen");
                    if (middleware.isAuthenticated(req)) {
                        callback();
                    } else {
                        if (req.query.key) {
                            security.isAllowed(req.query.key, (err, access_ganted) => {
                                if (access_ganted) {
                                    logger.info("access granted to stream");
                                    callback();
                                } else {
                                    logger.warn("Anonymous access forbidden: Using a wrong query access key");
                                    middleware.redirect('/login', res);
                                }
                            });
                        } else {
                            logger.warn("Anonymous access forbidden: authentication required to stream");
                            middleware.redirect('/login', res);
                        }
                    }
                } else {
                    logger.debug("userauth is not required to listen");
                    callback();
                }
            });
        }
    };

}


var helpers = new Helpers();


router.get('/library/filter/:search/:page', (req, res) => {
    logger.debug("Search filtering audio library");

    var groupby = req.session.groupby ? req.session.groupby : DEFAULT_GROUP_BY;
    var sortby = req.session.sortby ? req.session.sortby : DEFAULT_SORT_BY;

    var libraryDatas;
    var opts = {
        filter: req.params.search,
        type: 'audio',
        groupby: groupby,
        sortby: sortby
    };
    if (req.params.page === "all") {
        libraryDatas = library.search(opts);
    } else {
        opts.page = req.params.page;
        opts.lenght = 3;
        libraryDatas = library.searchPage(opts);
    }

    middleware.json(req, res, libraryDatas);
});

router.get('/library', (req, res) => {
    logger.debug("Get all audio library");
    var groupby = req.session.groupby ? req.session.groupby : DEFAULT_GROUP_BY;
    var sortby = req.session.sortby ? req.session.sortby : DEFAULT_SORT_BY;

    var libraryDatas = visibleLibrary(req).getAudio(groupby, sortby);
    middleware.json(req, res, libraryDatas);
});

router.get('/groupby/:groupby', (req, res) => {
    req.session.groupby = req.params.groupby.split(",");
    req.session.save(() => {

        logger.debug("changed groupby: ", req.session.groupby);

        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.json({ status: "ok" });
    });
});

router.get('/sortby/:sortby', (req, res) => {
    req.session.sortby = req.params.sortby;
    req.session.save(() => {

        logger.debug("changed sortby: ", req.session.sortby);

        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.json({ status: "ok" });
    });
});

router.get('/library/:page', (req, res) => {
    // load by page of 3 artists.
    var groupby = req.session.groupby ? req.session.groupby : DEFAULT_GROUP_BY;
    var sortby = req.session.sortby ? req.session.sortby : DEFAULT_SORT_BY;

    logger.debug("Get all one page of library ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = visibleLibrary(req).getAudio(groupby, sortby);
    } else {
        libraryDatas = visibleLibrary(req).getAudio(req.params.page, 3, groupby, sortby);
    }
    middleware.json(req, res, libraryDatas);
});


router.get('/artists/:page', (req, res) => {
    // load by page of 3 artists.

    logger.debug("Get all one page of artists ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = visibleLibrary(req).getArtists();
    } else {
        libraryDatas = visibleLibrary(req).getArtists(req.params.page, 4);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/albums/:page', (req, res) => {
    // load by page of 3 artists.

    logger.debug("Get all one page of artists ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = visibleLibrary(req).getLibAlbums();
    } else {
        libraryDatas = visibleLibrary(req).getLibAlbums(req.params.page, 4);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/artist/:name', (req, res) => {

    logger.debug("Get detail page of artist ".concat(req.params.name));
    var datas = visibleLibrary(req).getArtistDetails(req.params.name);
    middleware.json(req, res, datas);
});

router.post('/artist-properties/:name', (req, res) => {
    console.log('Save artist image: ', library.getArtistImage(req.params.name));
    if (!fs.existsSync(path.resolve(__dirname, '../../../../public/artists-covers'))) {
        fs.mkdirSync(path.resolve(__dirname, '../../../../public/artists-covers'));
    }
    var file = fs.createWriteStream(path.resolve(__dirname, `../../../../public/artists-covers/${req.params.name}`));

    https.get(library.getArtistImage(req.params.name), (response) => {
        response.pipe(file);

        response.on('end', () => {
            res.json({
                message: "ok"
            });
        });
    });
});

router.get('/artists/filter/:search/:page', (req, res) => {
    // load by page of 3 artists.

    logger.debug("Get all one page of artists ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = visibleLibrary(req).getArtists(null, null, req.params.search);
    } else {
        libraryDatas = visibleLibrary(req).getArtists(req.params.page, 4, req.params.search);
    }
    middleware.json(req, res, libraryDatas);
});

// An album: its artist tells it apart from the albums of other artists with the same title
router.get('/album/:artist/:album', (req, res) => {
    middleware.json(req, res, visibleLibrary(req).getAlbumOf(req.params.artist, req.params.album));
});

router.get('/album-artists/:name', (req, res) => {
    middleware.json(req, res, visibleLibrary(req).getAlbumArtists(req.params.name));
});

router.get('/album/:name', (req, res) => {

    logger.debug("Get detail page of artist ".concat(req.params.name));
    var datas = libraryDatas = visibleLibrary(req).getAlbum('all', req.params.name);
    middleware.json(req, res, datas);
});

router.get('/albums/filter/:search/:page', (req, res) => {
    // load by page of 3 artists.

    logger.debug("Get all one page of albums ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = visibleLibrary(req).getLibAlbums(null, null, req.params.search);
    } else {
        libraryDatas = visibleLibrary(req).getLibAlbums(req.params.page, 4, req.params.search);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/tracks/filter/:search/:page', (req, res) => {
    // load by page of 3 items.
    // var groupby = 'tracks' // req.session.groupby ? req.session.groupby : DEFAULT_GROUP_BY;
    const sortby = req.session.sortby ? req.session.sortby : DEFAULT_SORT_BY;
    let username = undefined;
    if (req.session.passport) {
        username = req.session.passport.user.username
    }
    const opts = {
        user: username,
        filter: req.params.search,
        type: 'audio',
        groupby: undefined,
        sortby: sortby,
        page: req.params.page,
        lenght: req.query.lenght ? req.query.lenght : 10,
    };

    logger.debug("Get all one page of tracks ".concat(req.params.page));
    let libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = library.search(opts);
    } else {
        libraryDatas = library.searchPage(opts);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/stream/:media', (req, res) => {
    var stream = function () {
        return new Promise((resolve, reject) => {
            logger.debug("streaming audio");
            middleware.stream(req, res, req.params.media, "audio");
            resolve(req.params.media);
        }).catch((error) => {
            console.error(error);
            res.status(404).json({ "error": "media not found" });
        });
    };
    helpers.checkingAuthorization(req, res, () => {
        stream().then((mediauid) => {
            // TODO change the increment plays to get real play state.
            // streaming method is not good solution.
            // cause of this method is called each time the song is loaded and not played 
            helpers.incrementPlays(mediauid, req.session.sessionID);
        });
    });
});

/**
 * Placeholder put in the library data when an album or artist has no image. It is never
 * sent as an image: the routes answer 404 and the client shows its own placeholder, which
 * follows the theme.
 */
function realImage(url) {
    return typeof url === 'string' && url.trim() !== '' && !url.endsWith('/static/img/album.png') && !url.endsWith('/static/img/artist.jpg')
        ? url : null;
}

router.get("/song-image/:songid", (req, res) => {
    var track = library.getByUid(req.params.songid);
    var albumart = track && library.getAlbumArtImage(req.params.songid);
    var image = albumart && albumart.cover ? realImage(albumart.cover[0]) : null;
    image ? res.redirect(image) : res.status(404).end();
});

// Image chosen by an administrator, then the cover of the album folder, then Last.fm
router.get("/static/covers/:artist/:album/cover.jpg", (req, res) => {
    var custom = library.customImagePath(req.params.artist, req.params.album);
    var albumart = fs.existsSync(custom) ? custom : library.getAlbumCoverByName(req.params.artist, req.params.album);
    if (albumart) {
        res.sendFile(albumart);
    } else {
        var image = realImage(library.getCoverImage(req.params.artist, req.params.album));
        image && !image.startsWith('/api/audio/static/covers/') ? res.redirect(image) : res.status(404).end();
    }
});

// Image chosen by an administrator, then the downloaded cover, then Last.fm
router.get("/static/covers/:artist/cover.jpg", (req, res) => {
    var custom = library.customImagePath(req.params.artist);
    var downloaded = path.resolve(__dirname, '../../../../public/artists-covers', path.basename(req.params.artist));
    if (fs.existsSync(custom)) {
        res.sendFile(custom);
    } else if (req.params.artist === path.basename(req.params.artist) && fs.existsSync(downloaded) && fs.statSync(downloaded).isFile()) {
        res.sendFile(downloaded);
    } else {
        var image = realImage(library.getArtistImage(req.params.artist));
        // No image: the client shows its placeholder
        image ? res.redirect(image) : res.status(404).end();
    }
});

/** The library as the connected user sees it: no private uploads of the other users */
function visibleLibrary(req) {
    return library.forUser(req.session && req.session.passport && req.session.passport.user ? req.session.passport.user.username : null);
}

/**
 * Calls back with the tracks of `ids` whose tags the connected user may write: administrators
 * any track, the other users their own uploads. Answers 401/403 otherwise.
 */
function withEditableTracks(req, res, ids, callback) {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'string')) {
        return res.status(400).json({ message: 'ids must be a list of track uids' });
    }
    const { uid, username } = req.session.passport.user;
    user.isAdministrator(uid, (err, administrator) => {
        const tracks = ids.map((id) => library.getByUid(id));
        if (tracks.some((track) => !track)) {
            return res.status(404).json({ message: 'No such track' });
        }
        if (!administrator && tracks.some((track) => !track.private || track.user !== username)) {
            return res.status(403).json({ message: 'You can only edit the tags of your own uploads' });
        }
        callback(tracks);
    });
}

/** Writes the tags into the files, then reads them again; answers with the updated tracks */
function writeTags(res, tracks, metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return res.status(400).json({ message: 'metadatas must be an object' });
    }
    const updated = [];
    async.eachLimit(tracks, 10, (track, next) => {
        ffmetadata.write(track.file, metadata, (err) => {
            if (err) {
                return next(err);
            }
            library.refreshMetadatas(track.uid).then((element) => {
                updated.push(element);
                next();
            }, next);
        });
    }, (err) => {
        if (err) {
            logger.error("Error writing metadata", err);
            const readOnly = err && ['EROFS', 'EACCES', 'EPERM'].includes(err.code) || /permission denied|read-only/i.test(String(err && err.message));
            return res.status(500).json({ message: readOnly ? 'The file is read-only on the server' : 'The tags could not be written' });
        }
        logger.info("Data written");
        res.status(200).json({ message: 'Data written', tracks: updated });
    });
}

router.post('/metadata/set/:id', (req, res) => {
    withEditableTracks(req, res, [req.params.id], (tracks) => writeTags(res, tracks, req.body));
});

router.put('/metadata/selection/set/', (req, res) => {
    withEditableTracks(req, res, req.body.ids, (tracks) => writeTags(res, tracks, req.body.metadatas));
});

router.get(['/my-library', '/my-library/:folder'], (req, res) => {
    //if (nconf.get("allowUpload") === 'true') {
    if (req.session.passport && req.session.passport.user) {
        const username = req.session.passport.user.username;
        const folder = req.params.folder ? helpers.decrypt(filesMap[req.params.folder]).trim() : req.params.folder;
        let folderReading = path.join(DEFAULT_USERS__DIRECTORY, username, "imported");
        let canonicalFolderName = '';
        if (!fs.existsSync(path.join(DEFAULT_USERS__DIRECTORY, username))) {
            fs.mkdirSync(path.join(DEFAULT_USERS__DIRECTORY, username));
            fs.mkdirSync(path.join(DEFAULT_USERS__DIRECTORY, username, "imported"));
        }
        if (!fs.existsSync(folderReading)) {
            return res.status(500).json({
                message: 'Destination file doesn\'t exists contact your administrator'
            });
        }
        let fileAskLocationEncrypt = '';
        if (folder) {
            folderReading = path.join(folderReading, folder);
            canonicalFolderName = path.join(canonicalFolderName, folder);

            const fileAskLocation = path.join(DEFAULT_USERS__DIRECTORY, username, canonicalFolderName, '..');
            fileAskLocationEncrypt = helpers.encrypt(fileAskLocation);
            filesMap[fileAskLocationEncrypt.substring(0, 32)] = fileAskLocationEncrypt;
        }
        
        try {
            const fileToTest = folderReading.replace(/[^\x20-\x7E]+/g, '').trim();
            if (fs.statSync(fileToTest).isFile()) {
                var rstream = fs.createReadStream(fileToTest);
                return rstream.pipe(res);
            }
            var files = fs.readdirSync(folderReading);
            files = _.map(files, (file) => {
                const canonicalName = path.resolve(folderReading, file);
                const stat = fs.statSync(canonicalName);
                const location = path.join(canonicalFolderName, file);
                const encrypted = helpers.encrypt(location);
                filesMap[encrypted.substring(0, 32).trim()] = encrypted;
                return {
                    name: file,
                    type: stat.isDirectory(path.resolve(folderReading, file)) ? 'directory' : 'file',
                    stat: stat,
                    location: encrypted.substring(0, 32).trim(),
                    locationFolder: canonicalName
                };
            });
            let locationFolder = req.params.folder ? folderReading: '';
            const locationFolderParent = path.resolve(folderReading, '..');
            const encryptedFolderParent = locationFolder !== '' ? helpers.encrypt(locationFolderParent).substring(0, 32): '';
            const folderId = helpers.encrypt(folderReading);
            filesMap[folderId.substring(0, 32)] = folderId;
            res.send({
                files: files,
                location: {
                    name: `/${folder ? folder : ''}`,
                    id: folderId.substring(0, 32),
                    parent: encryptedFolderParent
                }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json(err);
        }
    }
    /*} else {
        res.status(403).json({ message: 'Not allowed.' });
    }*/
});

router.post('/my-library/create-folder', (req, res) => {
    if (req.session.passport && req.session.passport.user) {
        const username = req.session.passport.user.username;
        const folder = req.body.location && req.body.location.id ? helpers.decrypt(filesMap[req.body.location.id]).trim() : '';
        
        let userFolder = path.join(DEFAULT_USERS__DIRECTORY, username, "imported");
        if (!fs.existsSync(path.join(DEFAULT_USERS__DIRECTORY, username))) {
            fs.mkdirSync(path.join(DEFAULT_USERS__DIRECTORY, username));
            fs.mkdirSync(path.join(DEFAULT_USERS__DIRECTORY, username, "imported"));
        }
        if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder);
        }
        if (req.body.folder.indexOf('..') !== -1){
            return res.status(500).json({
                msg: 'Cannot create relative dir'
            });
        }
        const targetFolder = path.resolve(folder, req.body.folder);
        fs.mkdirSync(targetFolder);
        const encrypted = helpers.encrypt(targetFolder);
        filesMap[encrypted.substring(0, 32).trim()] = encrypted;
        res.send({
            files: [],
            location: {
                name: `/${targetFolder.replace(userFolder, '')}`,
                id: encrypted.substring(0, 32).trim(),
                location: targetFolder
            }
        })
    } else {
        req.status(403).send()
    }
});

router.post(['/upload', '/upload/:folder'], (req, res) => {
    //if (nconf.get("allowUpload") === 'true') {
    if (req.session.passport && req.session.passport.user) {
        const folder = req.params.folder ? helpers.decrypt(filesMap[req.params.folder]).trim() : req.params.folder;
        var username = req.session.passport.user.username;
        var folderReading = path.join(DEFAULT_USERS__DIRECTORY, username, "imported");

        res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (!fs.existsSync(path.join(DEFAULT_USERS__DIRECTORY, username))) {
            fs.mkdirSync(path.join(DEFAULT_USERS__DIRECTORY, username));
        }

        if (!fs.existsSync(folderReading)) {
            fs.mkdirSync(folderReading);
        }

        if (folder) {
            folderReading = path.join(folderReading, folder);
        }

        quota.check(req, res, username, (remaining) => importer.receive(req, folderReading, remaining).then((results) => {
            library.addFolder({
                path: path.join(DEFAULT_USERS__DIRECTORY, username),
                username: username,
                private: true
            }, (scanResult) => {
                console.log("Folder added");
                res.json({
                    message: 'ok',
                    files: results
                });
            });
        }));
    }
    /*} else {
        res.status(403).json({ message: 'Not allowed.' });
    }*/
});

router.get("/featured/:page", (req, res) => {
    const page = req.params.page;
    const lenght = req.query.lenght;
    const stats = [{ name: 'plays', type: 'track' },
    { name: 'plays-genre' }];
    getStatistics(stats, function (err, entries) {
        const tracks = _.first(_.rest(entries, page * lenght), lenght);
        middleware.json(req, res, { stats: tracks });
    });
});


module.exports = router;
