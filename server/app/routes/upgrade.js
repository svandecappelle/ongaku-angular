const models = require('../models');
const express = require('express');
const async = require('async');
const path = require('path');
const nconf = require('nconf');

const version = require(path.resolve(__dirname, '../utils/version'));
const upgrader = require(path.resolve(__dirname, '../../db/postgres/upgrade'));

const router = express.Router();
const git = require('./../middleware/git');

router.get('/', function (req, res, next) {
  version.check().then(version => {
    res.json({
      title: 'Upgrader',
      version: version.launched,
      bddVersion: version.installed,
      database: nconf.get('database')
    });
  }).catch(next);
});

/** Updates the code from its git remote (fast-forward only); the server must then be restarted */
router.post('/git/check', function (req, res) {
  git.update().then((sha) => {
    const message = `Application updated to ${sha}`;
    console.log(message);
    res.json({ message: message, sha: sha });
  }).catch((err) => {
    console.error('Update failed', err.message);
    res.status(500).json({ message: 'The application could not be updated (on Docker, run "make upgrade" on the server)' });
  });
});

router.post('/', (req, res) => {
  version.check().then(version => {
    upgrader.upgrade({ from: version.installed, to: version.launched }).then((status) => {
      console.log("upgraded");
      res.json({
        message: 'Application upgraded to 1.0.1'
      })
    }).catch((error) => {
      res.status(500).json({
        error: error
      });
    });
  })
})


module.exports = router;
