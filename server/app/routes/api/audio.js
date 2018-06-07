/*jslint node: true */

const express = require('express');
const logger = require('log4js').getLogger("UsersRoutes");
const nconf = require("nconf");
const passport = require("passport");
const _ = require("underscore");
const unzip = require("node-unzip-2");
const path = require("path");
const Busboy = require('busboy');
const ffmetadata = require("ffmetadata");
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const exporter = require("./../../middleware/exporter");
const meta = require("./../../meta");
const communication = require("./../../communication");
const user = require("./../../model/user");
const userlib = require("./../../model/library");
const playlist = require("./../../model/playlist");
const statistics = require("./../../model/statistics");
const security = require("./../../model/security");
const mime = require("mime");
const fs = require("fs");
const he = require('he');
const tinycolor = require("tinycolor2");
// const translator = require("./../../middleware/translator");
const async = require("async");

var router = express.Router();

try {
    const player = require("./../../middleware/desktop-player");
} catch (err) {
    logger.warn('Application cannot be used using desktop player.');
}

const DEFAULT_USERS__DIRECTORY = path.join(__dirname, "/../../../../public/user/");
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

            entries = _.map(entries, function (element) {
                if (statistic.type === 'track') {
                    var track = library.getByUid(element[0]);
                    if (track) {
                        track.plays = parseInt(element[1]);
                    }
                    return track;
                } else {
                    return { title: element[0], 'plays-genre': parseInt(element[1]) };
                }
            });

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

    var libraryDatas = library.getAudio(groupby, sortby);
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
        libraryDatas = library.getAudio(groupby, sortby);
    } else {
        libraryDatas = library.getAudio(req.params.page, 3, groupby, sortby);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/artists/library/:page', (req, res) => {
    // load by page of 3 artists.
    var groupby = ['artist'];
    var sortby = ['artist'];

    logger.debug("Get all one page of library ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = library.getAudio(groupby, sortby);
    } else {
        libraryDatas = library.getAudio(req.params.page, 3, groupby, sortby);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/artists/:page', (req, res) => {
    // load by page of 3 artists.
   
    logger.debug("Get all one page of artists ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = library.getArtists();
    } else {
        libraryDatas = library.getArtists(req.params.page, 3);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/albums/:page', (req, res) => {
    // load by page of 3 artists.
   
    logger.debug("Get all one page of artists ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = library.getLibAlbums();
    } else {
        libraryDatas = library.getLibAlbums(req.params.page, 3);
    }
    middleware.json(req, res, libraryDatas);
});

router.get('/albums/library/:page', (req, res) => {
    // load by page of 3 artists.
    var groupby = ['album'];
    var sortby = ['album'];

    logger.debug("Get all one page of library ".concat(req.params.page));
    var libraryDatas = null;

    if (req.params.page === "all") {
        libraryDatas = library.getAudio(groupby, sortby);
    } else {
        libraryDatas = library.getAudio(req.params.page, 3, groupby, sortby);
    }
    middleware.json(req, res, libraryDatas);
});


router.get('/artists/library/filter/:search/:page', (req, res) => {
    logger.debug("Search filtering audio library");

    var groupby = ['artist'];
    var sortby = ['artist'];

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


router.get('/albums/library/filter/:search/:page', (req, res) => {
    logger.debug("Search filtering audio library");

    var groupby = ['album'];
    var sortby = ['album'];

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

router.get('/stream/:media', (req, res) => {
    var stream = function () {
        return new Promise((resolve, reject) => {
            logger.debug("streaming audio");
            middleware.stream(req, res, req.params.media, "audio");
            resolve(req.params.media);
        }).catch((error) => {
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

router.get("/song-image/:songid", (req, res) => {
    var albumart = library.getAlbumArtImage(req.params.songid);
    if (albumart && albumart.cover) {
        if (req.query.quality === 'best') {
            albumart = _.last(albumart);
        }
        res.redirect(albumart.cover[0]);
    } else {
        res.redirect("/img/album.jpg");
    }
});




router.get('/api/user/:username/library/:page', (req, res) => {
    var username = req.params.username;
    helpers.renderLibraryPage(username, req, res);
});

router.get('/api/user/:username/library/filter/:search/:page', (req, res) => {
    logger.debug("Search filtering audio library");
    var username = req.params.username;
    helpers.renderLibraryPage(username, req, res);
});

router.post('/api/metadata/set/:id', (req, res) => {
    var id = req.params.id;
    var data = req.body;
    var metadata = req.body.metadatas;
    var filename = library.getFile(id);

    ffmetadata.write(filename, data, (err) => {
        if (err) {
            res.status(500).json('Error writing metadata');
            logger.error("Error writing metadata", err);
        } else {
            logger.info("Data written");
            res.status(200).json('Data written');
            library.refreshMetadatas(id);
        }
    });

});

router.post('/api/metadata/selection/set/', (req, res) => {
    var ids = req.body.ids;
    var metadata = req.body.metadatas;

    logger.info("set metadata on ", ids, metadata);
    async.eachLimit(ids, 10, (id, next) => {
        var filename = library.getFile(id);
        ffmetadata.write(filename, metadata, (err) => {
            library.refreshMetadatas(id);
            next(err);
        });
    }, (err) => {
        if (err) {
            res.status(500).json('Error writing metadata');
            logger.error("Error writing metadata", err);
        } else {
            logger.info("Data written");
            res.status(200).json('Data written');
        }
    });
});

// TODO ?
router.get("/api/users", (req, res) => {
    res.json();
});


var onUploadView = (req, res) => {
    if (nconf.get("allowUpload") === 'true') {
        helpers.redirectIfNotAuthenticated(req, res, () => {
            var username = req.session.passport.user.username;
            var folder = req.params.folder;

            if (fs.existsSync(DEFAULT_USERS__DIRECTORY + username + "/imported")) {
                var folderReading = DEFAULT_USERS__DIRECTORY + username + "/imported/";
                if (folder) {
                    folderReading += folder + "/";
                }

                middleware.render('user/upload', req, res, {
                    files: fs.readdirSync(folderReading)
                });
            } else {
                middleware.render('user/upload', req, res);
            }
        });
    } else {
        middleware.redirect('403', res);
    }
};



router.get("/api/featured", (req, res) => {
    var stats = [{ name: 'plays', type: 'track' },
    { name: 'plays-genre' }];
    getStatistics(stats, function (err, entries) {
        middleware.json(req, res, { stats: entries });
    });
});


module.exports = router;
