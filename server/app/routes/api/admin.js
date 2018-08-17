const express = require('express');
const _ = require("underscore");
const async = require("async");
const moment = require('moment');
const nconf = require('nconf');

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const statistics = require("./../../model/statistics");
const application = require("./../../index");
const user = require("./../../model/user");

var router = express.Router();

function redirectIfNotAdministrator (req, res, callback) {
    if (middleware.isAuthenticated(req)) {
        user.isAdministrator(req.session.passport.user.uid, (err, administrator) => {
            if (administrator){
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
        async.eachLimit(days, 15, (day, next) => {
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


router.get('/current', (req, res) => {
    console.debug("get current playlist");
    res.send({ all: _.compact(req.session.playlist), name: req.session.playlistname });
});

router.get('/statistics/users/access', (req, res) => {
    getDayStatistics(25, 'any').then((data) => {
        res.json(data);
    });
});

router.get('/statistics/users/login', (req, res) => {
    getDayStatistics(25, 'logins').then((logins) => {
        getDayStatistics(25, 'failed-logins').then((failedLogins) => {
            res.json({
                succeed: logins,
                failed: failedLogins
            })
        });
    });
});

router.get('/statistics/users/activity', (req, res) => {
    getDayStatistics(25, 'plays').then((data) => {
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
module.exports = router;
