const express = require('express');
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");

const userlib = require("./../../model/library");
const user = require("./../../model/user");

const async = require("async");

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


router.get('/me', (req, res) => {
    var uid = req.session.passport.user.uid;
    user.getUsers([uid], (error, data) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
        user.getGroups(uid, (groups) => {
            data[0].groups = groups;
            res.json(data[0]);
        });
    });
});

router.post(['/image/:type' ], (req, res) => {
    var username = req.session.passport.user.username;
    var type = req.params.type;
    if (type !== 'avatar' && type !== 'cover'){
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