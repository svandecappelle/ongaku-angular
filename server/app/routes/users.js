var { User, Group, sequelize } = require('../sql-models');
var express = require('express');
var async = require('async');

var router = express.Router();

router.get('/init', (req, res) => {
  async.timesLimit(100, 10, (id, next) => {
    User.create({username: `user-${id}`, password: `passwd-${id}`}).then(()=>{
      next(null);
    });
  }, () => {
    res.json( { message: 'database initialized' } );
  })
});

router.get('/list', function (req, res, next) {
  User.findAll().then(function (users) {
    res.json(users);
  })
});

router.get('/fetch/:page/:size', function (req, res, next) {
  console.log(`fetch users : ${req.params.page} ---- ${req.params.size}`);
  User.findAll({ offset: req.params.page * req.params.size, limit: req.params.size }).then(function (users) {
    res.json(users);
  })
});

router.get('/assign-group/:username/:groupname', function (req, res, next) {
  Group.findOne({ where: {id: req.params.groupname}}).then( (group) => {
    User.findOne({ where: {id: req.params.username}}).then( (user) => {
      user.addGroup(group);
      res.json({message: "associated"});
    });
  });
});

router.get('/get-groups/:username', function (req, res, next) {

  // raw query example:
  sequelize.query("SELECT * FROM users", { type: sequelize.QueryTypes.SELECT})
  .then(users => {
    // We don't need spread here, since only the results will be returned for select queries
    console.log(users);
  });

  User.findOne({ where: {id: req.params.username}}).then( (user) => {
    user.getGroup().then( (groups) => {
      res.json(groups);
    });
  });
});


module.exports = router;
