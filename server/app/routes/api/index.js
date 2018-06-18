var express = require('express');
const audio = require('./audio');
const user = require('./user');
const admin = require('./admin');
const downloader = require('./downloader');
const uploader = require('./uploader');
const playlist = require('./playlist');
const statistics = require('./statistics');


var router = express.Router();
router.use('/audio', audio);
router.use('/playlist', playlist);
router.use('/downloader', downloader);
router.use('/uploader', uploader);
router.use('/statistics', statistics);

router.use('/user', user);
router.use('/admin', admin);

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




module.exports = router;