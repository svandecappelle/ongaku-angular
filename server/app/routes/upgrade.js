const models = require('../models');
const express = require('express');
const async = require('async');
const path = require('path');
const version = require(path.resolve(__dirname, '../utils/version'));

const yaml_config = require('node-yaml-config');

const upgrader = require(path.resolve(__dirname, '../../db/postgres/upgrade'));

var router = express.Router();

router.get('/', function (req, res, next) {
  version.check().then(version => {
    res.json({
      title: 'Upgrader',
      version: version.launched,
      bddVersion: version.installed,
      database: yaml_config.load(path.resolve(__dirname, '../../../config/config.yml')).database
    });
  });
});


router.post('/', (req, res) => {
  version.check().then(version => {
    upgrader.upgrade( { from: version.installed, to: version.launched } ).then((status) => {
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
