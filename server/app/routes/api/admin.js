const express = require('express');
const _ = require("underscore");
const nconf = require("nconf");
const passport = require("passport");
const unzip = require("node-unzip-2");
const path = require("path");
const Busboy = require('busboy');
const ffmetadata = require("ffmetadata");
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const exporter = require("./../../middleware/exporter");
const meta = require("./../../meta");
const communication = require("./../../communication");
const user = require("./../../model/user");
const userlib = require("./../../model/library");

var router = express.Router();

router.get('/current', (req, res) => {
    console.debug("get current playlist");
    res.send({ all: _.compact(req.session.playlist), name: req.session.playlistname });
});


module.exports = router;
