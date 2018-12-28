const express = require('express');
const _ = require("underscore");
const fs = require('fs');
const path = require("path");
const async = require("async");
const moment = require('moment');
const nconf = require('nconf');
const getSize = require('get-folder-size');
const forever = require('forever');

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const statistics = require("./../../model/statistics");
const application = require("./../../index");
const user = require("./../../model/user");
const meta = require("./../../meta");

const MONTHS = 30;
const WEEKS = 7;
const APPLICATION_ID = "ongaku";
var router = express.Router();

function userStorages() {
    return new Promise((resolve, reject) => {
        user.getAllUsers((err, users) => {
            let folders = _.map(users.users, (userBean) => {
                return path.resolve(__dirname, `../../../../public/user/${userBean.username}/imported`);
            });
            folders = _.filter(folders, (folder) => {
                return fs.existsSync(folder);
            });
            if (folders.length > 0) {
                async.reduce(folders, 0, (currentSize, folder, next) => {
                    getSize(folder, (err, size) => {
                        if (err) { throw err; }
                        next(null, currentSize + size);
                    });
                }, function (error, ret) {
                    if (error) {
                        return reject(error);
                    }
                    resolve(ret);
                });
            } else {
                resolve(0);
            }
        });
    });
};

function redirectIfNotAdministrator(req, res, callback) {
    if (middleware.isAuthenticated(req)) {
        user.isAdministrator(req.session.passport.user.uid, (err, administrator) => {
            if (administrator) {
                callback();
            } else {
                middleware.render("api/middleware/403", req, res);
            }
        });
    } else {
        if (nconf.get('type') === "desktop") {
            console.info("Desktop mode all access is granted.");
            callback();
        } else {
            console.warn("Anonymous access forbidden: authentication required.");
            middleware.redirect('/login', res);
        }
    }
};

getDayStatistics = (nbDays, statname) => {
    moment().startOf('day');
    var days = [];
    for (var i = nbDays; i >= 0; i--) {
        var day = moment().startOf('day').subtract(i, 'days');
        days.push({
            date: day,
            time: day.format('x'),
            value: 0
        });
    }

    return new Promise((resolve, reject) => {
        async.eachLimit(days, 2 * WEEKS, (day, next) => {
            statistics.getOne(statname, day.time, (err, value) => {
                if (value) {
                    day.value = value;
                }
                if (err) {
                    console.error(err);
                }
                next();
            });
        }, () => {
            resolve(days);
        });
    });
}

router.get('/statistics', (req, res) => {
    library.usage().then(size => {
        userStorages().then(sizeUsers => {
            let totalSpaceUsed = ((size + sizeUsers) / 1024 / 1024).toFixed(2);
            let commonSpaceUsed = (size / 1024 / 1024).toFixed(2)
            let usersSpaceUsed = ((sizeUsers) / 1024 / 1024).toFixed(2);

            user.count((err, usersCount) => {
                res.send({
                    usersCount: usersCount,
                    albumsCount: library.count('album'),
                    tracksCount: library.count(),
                    storage: {
                        total: {
                            value: totalSpaceUsed,
                            label: totalSpaceUsed + 'Mb'
                        },
                        common: {
                            value: commonSpaceUsed,
                            label: commonSpaceUsed + 'Mb'
                        },
                        users: {
                            value: usersSpaceUsed,
                            label: usersSpaceUsed + 'Mb'
                        }
                    }
                });
            });
        });
    });
});

router.get('/current', (req, res) => {
    console.debug("get current playlist");
    res.send({ all: _.compact(req.session.playlist), name: req.session.playlistname });
});

router.get('/statistics/users/access', (req, res) => {
    getDayStatistics(MONTHS, 'any').then((data) => {
        res.json(data);
    });
});

router.get('/statistics/users/login', (req, res) => {
    getDayStatistics(3 * MONTHS, 'logins').then((logins) => {
        getDayStatistics(3 * MONTHS, 'failed-logins').then((failedLogins) => {
            res.json({
                succeed: logins,
                failed: failedLogins
            })
        });
    });
});

router.get('/statistics/users/activity', (req, res) => {
    getDayStatistics(3 * MONTHS, 'plays').then((data) => {
        res.json(data);
    });
});

router.post('/library/reload', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        application.reload().then(() => {
            var libraryDatas = library.getAudio();
            res.json(libraryDatas);
        });
    });
});

router.get('/library/reload', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        application.reload().then(() => {
            var libraryDatas = library.getAudio();
            res.json(libraryDatas);
        });
    });
});

router.get('/configure', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        var properties = ["global"];
        console.info("Client access to admin index [" + req.ip + "]");
        meta.settings.get(properties, (err, settings) => {
            res.json(settings);
        });
    });
});

router.post('/configure', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        var preferences = req.body;
        async.forEachOf(preferences, (value, key, callback) => {
            meta.settings.setOne("global", key, value, (err) => {
                if (err) {
                    callback(err);
                }

                console.info("Global parameter saved: ", key, value);
                callback();
            });
        }, () => {
            res.json({
                message: 'done'
            });
        });
    });
});

router.post('/restart', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        // TODO check if this can be optimized using forever scripts
        process.exit();
        /*forever.list(false, (err, processes) => {
            if (err) {
                console.error(err);
                res.status(500).send(err);
            } else if (processes) {
                console.log(processes);
                const ongaku = _.findWhere(processes, { uid: APPLICATION_ID });
                ongaku.index = _.indexOf(processes, ongaku);
                const pid = ongaku.pid;
                forever.restart(ongaku.index);
                res.send({ message: 'ok' });
            }
        });*/
    });
});
module.exports = router;
