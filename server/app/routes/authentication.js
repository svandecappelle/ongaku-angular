const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const nconf = require('nconf');
const logger = require('log4js').getLogger("authenticate");
const middleware = require('./../middleware/middleware');
const authority = require('./../middleware/authority');
const meta = require('./../meta');
const utils = require('./../utils');
const user = require('./../model/user');

class Authenticator {

  constructor () {
    passport.use(new LocalStrategy(authority.login));

    passport.serializeUser((user, done) => {
      done(null, user);
    });

    passport.deserializeUser((user, done) => {
      done(null, {
        uid: user.uid,
        username: user.username,
        administrator : user.administrator
      });
    });
  }

  register (req, res, viewtype) {
    user.count((err, usercount) => {
      meta.settings.getOne("global", "allowRegisteration", (err, val) => {
        if (parseInt(val) > 0){
          middleware.json({
            registerLeft: parseInt(val) - usercount > 0 ? parseInt(val) - usercount: 0,
          });
        } else {
          middleware.status(403).json({"error" : "Cannot access to this"});
        }
      });
    });
  };

  initialize (app) {
    this.app = app;
    this.app.use(passport.initialize());
    this.app.use(passport.session());
  };

  load () {
    this.app.get('/api/auth/', (req, res) => {
      res.send({
        connected: middleware.isAuthenticated(req)
      });
    });
    this.app.get('/api/auth/logout', authority.logout);
    this.app.get('/api/auth/register', this.register);

    this.app.post('/api/auth/logout', authority.logout);
    this.app.post('/api/auth/register', authority.register);
    this.app.post('/api/auth/login', (req, res, next) => {

      if (req.body.username && utils.isEmailValid(req.body.username)) {
        user.getUsernameByEmail(req.body.username, (err, username) => {
          if (err) {
            return next(err);
          }
          req.body.username = username ? username : req.body.username;
          authority.authenticate(req, res, next);
        });
      } else {
        authority.authenticate(req, res, next);
      }
    });
  };
}

module.exports = new Authenticator();
