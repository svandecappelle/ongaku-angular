const express = require('express');
const _ = require("underscore");
const nconf = require("nconf");
const passport = require("passport");
const unzip = require("node-unzip-2");
const path = require("path");
const Busboy = require('busboy');
const ffmetadata = require("ffmetadata");
const async = require("async");
const moment = require('moment');

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const exporter = require("./../../middleware/exporter");
const meta = require("./../../meta");
const communication = require("./../../communication");
const user = require("./../../model/user");
const userlib = require("./../../model/library");
const statistics = require("./../../model/statistics");


var router = express.Router();

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
    getDayStatistics(7, 'logins').then((data) => {
        res.json(data);
    });
});

module.exports = router;
