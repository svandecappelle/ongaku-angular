const express = require('express');
const async = require("async");
const _ = require("underscore");
const nconf = require("nconf");

const middleware = require("./../../middleware/middleware");
const communication = require("./../../communication");

const user = require("./../../model/user");


var router = express.Router();

router.get("/list", (req, res) => {
    user.getAllUsers().then(usersDatas => {
        async.map(usersDatas.users, (userData, next) => {
            userData.avatar = middleware.getAvatar(userData.username);
            userData.cover = middleware.getCover(userData.username);
            
            if (nconf.get('database') === 'redis') {
                user.getGroupsByUsername(userData.username, (groups) => {
                    userData = _.extend(userData, { groups: groups });
                    next(null, userData);
                });
            } else {
                next(null, userData);
            }
        }, (err, usersDatas) => {
            res.json(usersDatas);
        });
    }).catch(error => {
        console.error(error);
        res.status(500).send('Unexpected error.')
    });
});

module.exports = router;