var models = require('../models');
const express = require('express');
const bcrypt = require('bcrypt');
var router = express.Router();

router.post('/signup', function (req, res, next) {
  var user = {
    Name: req.body.name,
    Email: req.body.email,
    Pass: req.body.pass,
    Num: req.body.num
  }
  // var UserReg = mongoose.model('UserReg', RegSchema)
  /*UserReg.create(user, function(err, newUser) {
     if(err) return next(err)
     req.session.user = email
     return res.send('Logged In!')
  });*/
});

router.get('/login', function (req, res, next) {
  req.session.user = null;
  next();
});

router.post('/login', function (req, res, next) {
  var username = req.body.username
  var pass = req.body.password


  models.User.findOne({where: { username: username }}).then((user, err) => {
    if (err) return next(err)

    if ( !bcrypt.compareSync(pass, user.password) ) {
      return res.status(401).send({
        message: 'Invalid credentials !'
      });
    }
    req.session.user = user.username
    return res.json({token: 'a', username: username});
  })
});

router.post('/is-logged-in', function (req, res, next) {
  var username = req.body.username
  var pass = req.body.password

  req.session.user ? res.json({status: 'connected'}) : res.json({status: 'not-connected'})
});

router.get('/logout', function (req, res) {
  req.session.user = null
});

module.exports = router;
