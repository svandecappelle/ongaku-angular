var express = require('express');
const audio = require('./audio');
const playlist = require('./playlist');


var router = express.Router();
router.use('/audio', audio);
router.use('/playlist', playlist);


router.post("/api/set-color-scheme", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        user.setSingleSetting(req.session.passport.user.uid, 'color-scheme', req.body.color, () => {
            req.session.user['color-scheme'] = req.body.color
            req.session.save(function () {
                logger.info(`Setting theme ${req.body.color} saved to db`);
                res.status(200).send("OK");
            });
        });
    });
});

router.post("/api/files/set-properties/imported/:filename(*)", (req, res) => {
    if (nconf.get("allowUpload") === 'true') {
        helpers.redirectIfNotAuthenticated(req, res, () => {
            var username = req.session.passport.user.username;
            var file = req.params.filename;
            var isPublic = req.query.public === 'true';
            var folder = DEFAULT_USERS__DIRECTORY + username + "/imported/" + file;
            folder = he.decode(folder);
            logger.info("Set to public[" + isPublic + "] for user[" + username + "] folder: ", file);

            user.setSharedFolder(username, he.decode(file), isPublic, () => {
                if (isPublic) {
                    console.log("Folder " + folder + " scanning");
                    var type = ['audio', 'video'];

                    library.addFolder({
                        path: folder,
                        username: username
                    }, (scanResult) => {
                        console.log("Folder added");
                        type = _.without(type, scanResult.type);
                        if (type.lenght === 0) {
                            res.send({
                                message: 'ok'
                            });
                        }
                    });
                } else {
                    library.removeFolder({
                        path: folder,
                        username: username
                    });
                    res.send({
                        message: 'ok'
                    });
                }
            });
        });
    }
});


router.get("/api/download/:search/:page", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        var groupby = req.session.groupby;
        var username = req.session.passport.user.username;

        groupby = ["artist", "album"];

        var libraryDatas;
        var opts = {
            filter: req.params.search,
            type: 'audio',
            groupby: groupby
        };
        if (req.params.page === "all") {
            libraryDatas = library.search(opts);
        } else {
            opts.page = req.params.page;
            opts.lenght = 3;
            libraryDatas = library.searchPage(opts);
        }

        exporter.toZip(libraryDatas, username).then((filename) => {
            res.download(filename);
        });
    });
});

router.get("/api/album-download/:artist/:album", (req, res) => {

    var download = function (req, res) {
        var groupby = req.session.groupby;
        //var username = req.session.passport.user.username;

        groupby = ["artist", "album"];

        var libraryDatas,
            zipName = req.params.artist;
        if (req.params.album === "all") {
            libraryDatas = library.getAlbums(req.params.artist);
        } else {
            zipName += " - ".concat(req.params.album);
            libraryDatas = library.getAlbum(req.params.artist, req.params.album);
        }
        exporter.toZip(libraryDatas, zipName).then((filename) => {
            res.download(filename);
        });
    };

    if (req.query.key) {
        security.isAllowed(req.query.key, (err, access_ganted) => {
            if (err) {
                return res.json({});
            }

            if (access_ganted) {
                download(req, res);
            } else {
                res.status(403).json({ message: 'access forbidden without a valid key' });
            }
        });

    } else {
        helpers.callIfAuthenticated(req, res, () => {
            download(req, res);
        });
    }

});


router.get("/api/track-download/:uid", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        res.download(library.getFile(req.params.uid));
    });
});


router.get("/waveform/:uid", (req, res) => {
    try {
        var src = library.getRelativePath(path.basename(req.params.uid));
        var color = 'white';


        if (req.session.theme && _.contains(lights_themes, req.session.theme)) {
            color = '#929292';
        }

        if (req.query.color) {
            color = req.query.color;
        }
        var options = {
            waveColor: color,
            backgroundColor: "rgba(0,0,0,0)"
        };
        var Waveform = require('node-wave');

        res.writeHead(200, { 'Content-Type': 'image/png' });

        Waveform(src, options, (err, buffer) => {
            res.write(buffer);
            res.end();
        });
    } catch (error) {
        res.status(500).send("");
        logger.warn("Not compatible canvas generation wave.");
    }
});



module.exports = router;