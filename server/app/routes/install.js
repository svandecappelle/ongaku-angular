const express = require('express');
const path = require('path');
const yaml_config = require('node-yaml-config');
const version = require(path.resolve(__dirname, '../utils/version'));
const nconf = require('nconf');

var router = express.Router();
var installer;
if (nconf.get('database') === 'redis') {
  installer = require(path.resolve(__dirname, '../../db/redis/install'));
} else {
  installer = require(path.resolve(__dirname, '../../db/postgres/install'));
}

router.get('/', function (req, res, next) {
  version.sha().then(sha => {
    version.installed().then(versionNumber => {
      res.json({
        title: 'Installer',
        sha: sha,
        version: versionNumber,
        database: nconf.get('database') === 'postgresql' ? yaml_config.load(path.resolve(__dirname, '../../config/config.yml')).database : ''
      });
    });
  });
});

router.post('/', (req, res) => {
  installer.install(req.body).then((installed, errors) => {
    res.json({ install: 'ok' });
  }).catch((error) => {
    res.status(500).json(error);
  });
})

module.exports = router;
