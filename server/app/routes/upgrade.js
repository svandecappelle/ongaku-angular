const models = require('../models');
const express = require('express');
const async = require('async');
const path = require('path');
const version = require(path.resolve(__dirname, '../utils/version'));

const yaml_config = require('node-yaml-config');

const upgrader = require(path.resolve(__dirname, '../../db/postgres/upgrade'));

const router = express.Router();

const git = require('nodegit');

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

router.post('/git/check', function (req, res, next) {
  var repository;
  var commit;
  console.log(path.resolve(__dirname, '../../../'));
  git.Repository.open(path.resolve(__dirname, '../../../')).then((repo) => {
    repository = repo;
    console.log('Fetching repository');
    return repo.fetchAll({
      callbacks: {
        credentials: function(url, userName) {
          return git.Cred.sshKeyFromAgent(userName);
        }
      }
    })
  }).then(remote => {
    console.log("Merging code");
    return repository.mergeBranches("master", "origin/master");
  }).then(() => {
    return commit = repository.getHeadCommit();
  }).then((headCommit) => {
    commit = headCommit;
  }).done(() => {
    var message = `Application updated to origin/master ${commit.sha()}`;
    console.log(message);
    res.json({
      message: message
    });
  });
});


router.post('/git/check', function (req, res, next) {
  version.check().then(version => {
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
