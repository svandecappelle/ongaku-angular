const express = require('express');
const _ = require("underscore");

const user = require("./../../model/user");


var router = express.Router();

router.get("/list", function (req, res) {
    user.listPublic(function (err, users) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
        }
        res.json(_.sortBy(users, (userData) => userData.username.toLowerCase()));
    });
});

module.exports = router;
