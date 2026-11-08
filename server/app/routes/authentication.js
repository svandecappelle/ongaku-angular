const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const nconf = require('nconf');
const logger = require('log4js').getLogger("authenticate");
const middleware = require('./../middleware/middleware');
const authority = require('./../middleware/authority');
const meta = require('./../meta');
const utils = require('./../utils');
const user = require('./../model/user');
const { limitLogins, limitSignUps } = require('./../middleware/attempts');

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

  /** Whether sign up is open, and for how many more accounts: { open, registerLeft } */
  register (req, res) {
    user.count((err, usercount) => {
      meta.settings.getOne("global", "allowRegisteration", (err2, val) => {
        if (err || err2) {
          return res.status(500).json({ message: 'Internal server error' });
        }
        const left = Math.max((parseInt(val, 10) || 0) - (parseInt(usercount, 10) || 0), 0);
        res.json({ open: left > 0, registerLeft: left });
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
      const connected = middleware.isAuthenticated(req);
      // Read from the groups, not the session: the role may have changed since the login
      // (desktop mode grants the administration to everyone, see routes/api/admin.js)
      if (!connected) {
        return res.send({ connected: false, administrator: nconf.get('type') === 'desktop' });
      }
      user.isAdministrator(req.session.passport.user.uid, (err, administrator) => {
        res.send({ connected: true, username: req.session.passport.user.username, administrator: !err && !!administrator });
      });
    });
    this.app.get('/api/auth/logout', authority.logout);
    this.app.get('/api/auth/register', this.register);

    this.app.post('/api/auth/logout', authority.logout);
    // Slowed down: the guessing of passwords, the creation of accounts in numbers
    this.app.post('/api/auth/register', limitSignUps, authority.register);
    this.app.post('/api/auth/login', limitLogins, (req, res, next) => {

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
