const express = require('express');
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const async = require("async");
const _ = require("underscore");
const getSize = require('get-folder-size');

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const scanner = require("./../../middleware/scanner");

const userlib = require("./../../model/library");
const user = require("./../../model/user");

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

router.get('/me', (req, res) => {
    if (!req.session.passport || !req.session.passport.user) {
        return res.status(403).json({
            message: 'You need to be logged'
        });
    }
    var uid = req.session.passport.user.uid;
    var username = req.session.passport.user.username;
    var userdir = path.resolve(__dirname, `../../../../public/user/${username}`);
    var output = {};
    userStorage(username).then((usage) => {
        output.usage = usage;

        scanner.files(userdir).then((files) => {
            output.files = {
                count: files.length
            };
            user.getUsers([uid], (error, data) => {
                output = _.extend(output, data[0]);

                if (error) {
                    console.error(error);
                    return res.status(500).json({ message: "Internal server error" });
                }
                user.getGroups(uid, (groups) => {
                    output.groups = groups;
                    res.json(output);
                });
            });
        }).catch(error => {
            console.error(error);
            res.status(500).json({
                message: 'Internal server error'
            });
        });
    }).catch(err => {
        console.error(err);
        res.status(500).json({
            message: 'Internal server error'
        });
    });
});

router.get('/:username', (req, res) => {
    if (!req.session.passport || !req.session.passport.user) {
        return res.status(403).json({
            message: 'You need to be logged'
        });
    }
    var uid = req.session.passport.user.uid;
    var username = req.params.username;
    var userdir = path.resolve(__dirname, `../../../../public/user/${username}`);
    var output = {};
    user.getUidByUsername(username, (error, uid) => {
        userStorage(username).then((usage) => {
            output.usage = usage;
            scanner.files(userdir).then((files) => {
                output.files = {
                    count: files.length
                };
                user.getUsers([uid], (error, data) => {
                    output = _.extend(output, data[0]);

                    if (error) {
                        console.error(error);
                        return res.status(500).json({ message: "Internal server error" });
                    }
                    user.getGroups(uid, (groups) => {
                        output.groups = groups;
                        res.json(output);
                    });
                });
            }).catch(error => {
                console.error(error);
                res.status(500).json({
                    message: 'Internal server error'
                });
            });
        });
    });
});

router.post(['/image/:type'], (req, res) => {
    var username = req.session.passport.user.username;
    var type = req.params.type;
    if (type !== 'avatar' && type !== 'cover' && type !== 'background') {
        return res.status(403).json({
            message: 'Forbidden'
        });
    }

    var busboy = new Busboy({ headers: req.headers });
    req.session.save(function () {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
            var userdir = path.resolve(__dirname, `../../../../public/user/${username}`);

            if (!fs.existsSync(userdir)) {
                fs.mkdirSync(userdir);
            }
            var saveTo = path.resolve(userdir, `${type}`);
            file.pipe(fs.createWriteStream(saveTo));
        });
        busboy.on('finish', function () {
            res.json("ok upload");
        });

        req.pipe(busboy);
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
    var userFile = path.resolve(__dirname, `../../../../public${middleware.getImageFile(username, type)}`);
    res.sendFile(userFile);
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