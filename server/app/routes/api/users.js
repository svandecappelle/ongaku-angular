const express = require('express');
const async = require("async");
const _ = require("underscore");

const middleware = require("./../../middleware/middleware");
const communication = require("./../../communication");

const user = require("./../../model/user");


var router = express.Router();

router.get("/list", (req, res) => {
    user.getAllUsers(function (err, usersDatas) {
        async.map(usersDatas.users, function (userData, next) {
            userData.avatar = middleware.getAvatar(userData.username);
            userData.cover = middleware.getCover(userData.username);
            user.getGroupsByUsername(userData.username, function (groups) {
                userData = _.extend(userData, { groups: groups });
                next(null, userData);
            });
        }, function (err, usersDatas) {
            res.json(usersDatas);
        });
    });
});

module.exports = router;