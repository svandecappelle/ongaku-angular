var express = require('express');
const audio = require('./audio');
const user = require('./user');
const users = require('./users');
const admin = require('./admin');
const playlist = require('./playlist');
const likes = require('./likes');
const tracks = require('./tracks');
const lyrics = require('./lyrics');
const history = require('./history');
const radios = require('./radios');
const video = require('./video');
const books = require('./books');
const gallery = require('./gallery');
const shares = require('./shares');


var router = express.Router();
router.use('/audio', audio);
router.use('/playlist', playlist);
router.use('/likes', likes);
router.use('/tracks', tracks);
router.use('/lyrics', lyrics);
router.use('/history', history);
router.use('/radios', radios);
router.use('/video', video);
router.use('/books', books);
router.use('/images', gallery);
router.use('/shares', shares.owner);
router.use('/share', shares.visitor);

router.use('/user', user);
router.use('/users', users);
router.use('/admin', admin);

module.exports = router;