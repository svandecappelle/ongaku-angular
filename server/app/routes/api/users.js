const express = require('express');
const _ = require("underscore");

const user = require("./../../model/user");
const middleware = require("./../../middleware/middleware");
const communication = require("./../../communication");


var router = express.Router();

router.get("/list", function (req, res) {
    user.listPublic(function (err, users) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        // Who is online and what they play, for the members only
        const members = middleware.isAuthenticated(req);
        res.json(_.sortBy(users, (userData) => userData.username.toLowerCase()).map((userData) => members
            ? _.extend(userData, _.pick(communication.presenceOf(userData.username), 'online', 'nowPlaying'))
            : userData));
    });
});

/** The members online and what they play (also sent live: "presence:update" on the socket) */
router.get("/presence", function (req, res) {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    res.json(communication.snapshot());
});

module.exports = router;
