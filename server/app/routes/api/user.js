const express = require('express');
const logger = require('log4js').getLogger("UsersRoutes");
const nconf = require("nconf");
const passport = require("passport");
const path = require("path");
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const meta = require("./../../meta");
const communication = require("./../../communication");

const userlib = require("./../../model/library");

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


router.post('/library/add', (req, res) => {
    var username = req.session.passport.user.username,
        uids = req.body.elements;
    logger.debug("append to user lib: ".concat(username).concat(" -> ").concat(uids));

    async.each(uids, (uid, next) => {
        userlib.append(username, uid, () => {
            logger.debug("Appended to list: " + uid);
            next();
        });
    }, () => {
        logger.debug("All elements added");
    });
    res.send({ message: "ok" });
});

router.post('/library/remove', (req, res) => {
    var username = req.session.passport.user.username,
        uids = req.body.elements;
    logger.debug("remove to user lib: ".concat(username).concat(" -> ").concat(uids));

    async.each(uids, (uid, next) => {
        userlib.remove(username, uid, () => {
            logger.debug("Remove from list: " + uid);
            next();
        });
    }, () => {
        logger.debug("All elements removed");
    });
    res.send({ message: "ok" });
});


router.get('/:username/library/:page', (req, res) => {
    var username = req.params.username;
    helpers.renderLibraryPage(username, req, res);
});

router.get('/:username/library/filter/:search/:page', (req, res) => {
    logger.debug("Search filtering audio library");
    var username = req.params.username;
    helpers.renderLibraryPage(username, req, res);
});


module.exports = router;