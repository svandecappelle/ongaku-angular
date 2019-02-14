const passport = require('passport');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const _ = require('underscore');
const nconf = require('nconf');
const async = require("async");
const moment = require("moment");

const middleware = require("./middleware");
const communication = require("./../communication");
const meta = require('./../meta');
const user = require('./../model/user');
const db = require('./../model/database');
const library = require('./library');
const security = require('./../model/security');
const statistics = require('./../model/statistics');

const utils = require('./../utils');


const USERS_IMAGE_DIRECTORY = path.join(__dirname, "/../../../public/user/");

class Authenticator {
  login(req, res, userBean) {
    req.logIn(userBean, () => {
      if (userBean.uid) {
        //user.logIP(userData.uid, req.ip);
        console.info("user '" + userBean.username + "' connected on: " + req.ip);
        communication.setStatus(userBean.username, 'online');
        setTimeout(function () {
          communication.emit(userBean.username, 'application:connected', req.sessionID);
        }, 1500);

        statistics.set('logins', moment().startOf('day').format('x'), 'increment', () => {
          console.debug("Stats saved");
        });
      }

      var folderScanning = {
        private: true,
        path: USERS_IMAGE_DIRECTORY + userBean.username,
        username: userBean.username
      }

      if (fs.existsSync(folderScanning.path)) {
        library.addFolder(folderScanning, (scanResults) => {
          if (scanResults.audio) {
            req.session.library = scanResults;
            console.info(scanResults);
            middleware.sessionSave(req);
          }
        });
      }

      res.json({
        msg: 'authenticated',
        user: userBean
      });
    });
  }

  attemptLogin(uid, password) {
    return new Promise((resolve, reject) => {
      user.auth.logAttempt(uid).then((err) => {
        if (err) {
          if ("[[error:account-locked]]" === err.message) {
            return reject({
              code: '417',
              message: err.message
            });
            // return done(null, false, );
          } else {
            return reject(err.message);
          }
        }

        
        user.get(uid, ['password', 'banned']).then(userData => {
          if (!userData || !userData.password) {
            statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment').then(() => {
              console.debug("Stats saved");
            });
            return reject(new Error('[[error:invalid-user-data]]'));
          }

          if (userData.banned && parseInt(userData.banned, 10) === 1) {
            return reject({
              code: 403,
              message: '[[error:user-banned]]'
            });
          }

          bcrypt.compare(password, userData.password, (err, res) => {
            if (err) {
              return done(new Error('bcrypt compare error'));
            }
            if (!res) {
              statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment').then(() => {
                console.debug("Stats saved");
              });
              return reject({
                code: 401,
                message: '[[error:invalid-password]]'
              });
            }

            user.auth.clearLoginAttempts(uid);

            async.auto({
              settings: (next) => {
                user.getSettings(uid).then((res) => next(null, res));
              },
              security: (next) => {
                next(null, 'a');
                // TODO reactive that
                // security.getAccessId(uid).then((res) => next(null, res));
              }
            }, (err, results) => {
              resolve({
                uid: uid,
                settings: results.settings,
                security: results.security
              }, '[[success:authentication-successful]]');
            });

          });
        }).catch(err => {
          console.error(err);
          reject(err);
        });
      });
    });
  }
}
const auth = new Authenticator();

class Authority {

  logout(req, res) {
    if (middleware.isAuthenticated(req)) {
      console.info('[Auth] Session ' + req.sessionID + ' logout (uid: ' + req.session.passport.user + ')');
      req.session.locale = nconf.get("defaultLocale");
      let username = req.session.passport.username;
      setTimeout(() => {
        communication.emit(username, "notification", { message: 'disconnected from application' });
      }, 1500);

      req.logout();
    }

    res.json({
      msg: 'disconnected',
      connected: false
    });
  };

  authenticate(req, res, next) {

    if (meta.config.allowLocalLogin !== undefined && parseInt(meta.config.allowLocalLogin, 10) === 0) {
      return res.send(404);
    }
    passport.authenticate('local', (err, userData, info) => {
      var duration;
      if (err) {
        return next(err);
      }

      if (!userData) {
        console.warn("login attempt fails: ", info);
        return res.status(403).json(info);
      }

      // Alter user cookie depending on passed-in option

      if (req.body.remember === 'on') {
        duration = 1000 * 60 * 60 * 24 * parseInt(meta.config.loginDays || 14, 10);
        req.session.cookie.maxAge = duration;
        console.warn("Saving session for: " + duration + "ms");
      } else {
        duration = 1000 * 60 * 60 * 8;
        req.session.cookie.maxAge = duration;
      }
      if (userData.settings) {
        req.session = _.extend(req.session, userData.settings);
      }

      if (userData.settings && userData.settings.locale) {
        req.session.locale = userData.settings.locale;
      } else {
        req.session.locale = nconf.get("defaultLocale");
      }

      user.isAdministrator(userData.uid).then(admin => {
        userData.administrator = admin;
        var userBean = {
          uid: userData.uid,
          username: req.body.username,
          tokenId: userData.security,
          administrator: userData.administrator,
          token: req.passport
        };
        auth.login(req, res, userBean);
      });
    })(req, res, next);
  };

  register(req, res) {
    user.count((err, usercount) => {
      meta.settings.getOne("global", "allowRegisteration", (err, val) => {
        if (usercount < parseInt(val)) {
          if (req.body.password !== req.body.confirmPassword) {
            return res.status(400).json({
              message: 'Password and confirmation password mismatch'
            });
          }
          var userData = {
            username: req.body.username,
            password: req.body.password,
            email: req.body.email,
            ip: req.ip
          };

          user.create(userData, (err, uid) => {
            if (err || !uid) {
              console.error(err);
              return res.status(500).json({
                message: 'Internal server error'
              });
            }

            req.login({
              uid: uid,
            }, function () {
              // TODO log conncetion on database
              //user.logIP(uid, req.ip);
              // for the connected users count
              //require('../socket.io').emitUserCount();
              req.user.username = userData.username;
              res.json({
                message: 'OK'
              });
            });
          });
        } else {
          req.session.error = "Maximum user registered";
          return res.status(403).json({
            message: 'Forbidden: Maximum user registered'
          });
        }
      });
    });
  };

  login(username, password, done) {
    if (!username || !password) {

      statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment', () => {
        console.debug("Stats saved");
      });
      return done(new Error('[[error:invalid-user-data]]'));
    }

    user.getUidByUsername(username.trim()).then(uid => {
      if (!uid) {
        statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment', () => {
          console.debug("Stats saved");
        });
        // To-do: Even if a user doesn't exist, compare passwords anyway, so we don't immediately return
        return done(null, false, '[[error:no-user]]');
      }
      
      auth.attemptLogin(uid, password)
      .then(user => {
        done(null, user, '[[success:authentication-successful]]')
      })
      .catch(error => {
        done(error);
      });
    }).catch(err => {
      return done(err);
    });
  };
}

module.exports = new Authority();
