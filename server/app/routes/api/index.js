var express = require('express');
const audio = require('./audio');
const user = require('./user');
const users = require('./users');
const admin = require('./admin');
const playlist = require('./playlist');
const likes = require('./likes');
const tracks = require('./tracks');
const lyrics = require('./lyrics');


var router = express.Router();
router.use('/audio', audio);
router.use('/playlist', playlist);
router.use('/likes', likes);
router.use('/tracks', tracks);
router.use('/lyrics', lyrics);

router.use('/user', user);
router.use('/users', users);
router.use('/admin', admin);

module.exports = router;