const fs = require('fs');
const express = require('express');
const _ = require("underscore");
const path = require("path");
const library = require("./../../middleware/library");
const exporter = require("./../../middleware/exporter");

var router = express.Router();

router.get("/search/:search/:page", (req, res) => {
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

router.get("/album/:artist/:album", (req, res) => {

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

router.get("/track/:uid", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        res.download(library.getFile(req.params.uid));
    });
});

router.get("/waveform/:uid", (req, res) => {
    try {
        const src = library.getRelativePath(path.basename(req.params.uid));
        let color = 'white';
        if (req.session.theme && _.contains(lights_themes, req.session.theme)) {
            color = '#929292';
        }
        if (req.query.color) {
            color = req.query.color;
        }
        const options = {
            waveColor: color,
            backgroundColor: "rgba(0,0,0,0)"
        };
        const Waveform = require('node-wave');
        const waveformPath = path.resolve(path.dirname(src), `waveforms/${req.params.uid}-${color}.png`);

        fs.stat(waveformPath, (err, stat) => {
            const wavesDirectory = path.resolve(path.dirname(src), 'waveforms');

            if (err) {
                fs.stat(wavesDirectory, (error, stats) => {
                    if (error) {
                        try {
                            fs.mkdirSync(wavesDirectory);
                        } catch (err) {
                            // concurrent create folder.
                            // Should ignore this
                        }
                    }
                    res.writeHead(200, {
                        'Content-Type': 'image/png'
                    });
                    Waveform(src, options, (err, buffer) => {
                        if (err) {
                            console.error(err);
                            res.end();
                        } else {
                            res.write(buffer);
                            fs.writeFile(waveformPath, buffer, () => {
                                res.end();
                            });
                        }
                    });
                });
            } else if (stat) {
                return res.sendFile(waveformPath);
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("");
        console.warn("Not compatible canvas generation wave.");
    }
});


module.exports = router;
