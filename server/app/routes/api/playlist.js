const express = require('express');
const _ = require("underscore");
const nconf = require("nconf");
const passport = require("passport");
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

var router = express.Router();

router.get('/current', (req, res) => {
    console.debug("get current playlist");
    res.send({ all: _.compact(req.session.playlist), name: req.session.playlistname });
});

router.post('/current/add/:uid', (req, res) => {
    // TODO save playlist
    var uidFile = req.params.uid,
        track = library.getByUid(uidFile);
    console.debug("Add file to playlist", uidFile);
    if (req.session.playlist === undefined) {
        req.session.playlist = [];
    }

    if (track !== undefined) {
        req.session.playlist.push(track);
        req.session.save(function () {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.send({ all: req.session.playlist, lastAdded: track });
        });
    } else {
        console.warn("A playlist add request returns unknown track for: " + uidFile);
        res.send({ all: req.session.playlist, lastAdded: track });
    }
});


router.post('/current/addgroup', (req, res) => {
    var firstTrack;
    console.debug("Add group of file to playlist", req.body.elements);
    if (req.session.playlist === undefined) {
        req.session.playlist = [];
    }

    _.each(req.body.elements, (uid) => {
        var track = library.getByUid(uid);
        if (firstTrack === undefined) {
            firstTrack = track;
        }
        if (track !== undefined) {
            req.session.playlist.push(track);
        }
    });

    req.session.save(function () {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.send({ all: req.session.playlist, lastAdded: firstTrack });
    });
});

router.post('/current/remove/:id', (req, res) => {
    var id = req.params.id;
    console.debug("Remove file index to playlist: ", id);
    // TODO remove on saved playlist
    if (req.session.playlist !== undefined) {
        req.session.playlist.slice(id, 1);
    }

    req.session.save(function () {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.send({ all: req.session.playlist });
    });
});

router.post('/current/clear', (req, res) => {
    var id = req.params.id;
    // TODO remove on saved playlist
    console.debug("Remove file index to playlist: ", id);
    req.session.playlist = [];
    req.session.save(function () {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.send({ all: req.session.playlist });
    });
});
router.post('/new', (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        req.session.playlistname = null;
        req.session.playlist = [];

        req.session.save(function () {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.send(new SuccessCall().json());
        });
    });
});

router.post('/save', (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        var username = req.session.passport.user.username;
        var newplaylistname = req.body.playlistname;

        var appendToPlaylist = function () {
            console.debug("Add all playlist tracks");
            playlist.push(username, newplaylistname, req.session.playlist, () => {
                req.session.playlistname = newplaylistname;

                playlist.exists(username, newplaylistname, (err, exists) => {
                    if (!err && !exists) {
                        playlist.create(username, newplaylistname, () => {
                            req.session.save(function () {
                                res.setHeader('Access-Control-Allow-Credentials', 'true');
                                res.send(new SuccessCall().json());
                            });
                        });
                    } else {
                        req.session.save(function () {
                            res.setHeader('Access-Control-Allow-Credentials', 'true');
                            res.send(new SuccessCall().json());
                        });
                    }
                });
            });
        };

        if (req.session.playlistname) {
            if (newplaylistname) {
                console.debug("rename playlist: ", newplaylistname);
            }

            console.debug("clearing playlist: ", username, req.session.playlistname);
            playlist.remove(username, req.session.playlistname, () => {
                appendToPlaylist();
            });
        } else {
            appendToPlaylist();
        }
    });
});



router.get("/all/:username", (req, res) => {
    var username = req.params.username;
    playlist.getPlaylists(username, (err, playlists) => {
        res.json(playlists);
    });
});

router.get("/all", (req, res) => {
    if (middleware.isAuthenticated(req)) {
        var username = req.session.passport.user.username;
        playlist.getPlaylists(username, (err, playlists) => {
            res.json(playlists);
        });
    } else {
        return res.json();
    }
});

router.post("/load/:playlist", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        var playlistname = req.params.playlist;
        var username = req.session.passport.user.username;
        req.session.playlistname = playlistname;

        playlist.getPlaylistContent(username, playlistname, (err, playlistElements) => {
            var playlistObject = [];
            _.each(playlistElements, function (uidFile) {
                var track = library.getByUid(uidFile);
                playlistObject.push(track);
            });

            req.session.playlist = playlistObject;

            req.session.save(function () {
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.send(new SuccessCall().json());
            });
        });
    });
});

router.post("/delete/:playlist", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        var playlistname = req.params.playlist;
        var username = req.session.passport.user.username;

        req.session.playlistname = null;
        req.session.playlist = [];

        playlist.remove(username, playlistname, () => {
            req.session.save(function () {
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.send(new SuccessCall().json());
            });
        });
    });
});

router.get("/details/:playlist", (req, res) => {
    helpers.callIfAuthenticated(req, res, () => {
        var username = req.session.passport.user.username;
        playlist.getPlaylistContent(username, req.params.playlist, (err, playlistElements) => {
            var playlistObject = [];
            _.each(playlistElements, function (uidFile) {
                var track = library.getByUid(uidFile);
                playlistObject.push(track);
            });
            res.json({ all: playlistObject });
        });
    });
});


module.exports = router;
