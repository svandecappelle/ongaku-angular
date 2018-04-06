var models = require('../models');
var express = require('express');
var async = require('async');

var router = express.Router();


router.get('/list', function (req, res, next) {
  models.Group.findAll().then(function (users) {
    res.json(users);
  })
});

router.get('/fetch/:page/:size', function (req, res, next) {
  console.log(`fetch groups : ${req.params.page} ---- ${req.params.size}`);
  models.Group.findAll({ offset: req.params.page * req.params.size, limit: req.params.size }).then(function (users) {
    res.json(users);
  })
});

router.get('/create-group/:name', function (req, res, next) {
  models.Group.create({ name: req.params.name }).then( (users) => {
    res.json({message: `group ${req.params.name} created`});
  });
});

module.exports = router;
