const passport = require('passport');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const _ = require('underscore');
const nconf = require('nconf');
const logger = require('log4js').getLogger("authority");
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
const { invalidAccountFields } = require('./account-fields');


const USERS_IMAGE_DIRECTORY = path.join(__dirname, "/../../../public/user/");

class Authority {

    logout (req, res) {
      if (middleware.isAuthenticated(req)) {
        logger.info('[Auth] Session ' + req.sessionID + ' logout (uid: ' + req.session.passport.user + ')');
        req.session.locale = nconf.get("defaultLocale");
        let username = req.session.passport.username;
        setTimeout(() => {
          communication.emit(username, "notification", { message: 'disconnected from application' });
        }, 1500);

        return req.logout((err) => {
          if (err) {
            logger.error('[Auth] logout error', err);
          }
          res.json({
            msg: 'disconnected',
            connected: false
          });
        });
      }

      res.json({
        msg: 'disconnected',
        connected: false
      });
    };

    authenticate (req, res, next) {
      
      if (meta.config.allowLocalLogin !== undefined && parseInt(meta.config.allowLocalLogin, 10) === 0) {
        return res.sendStatus(404);
      }
      passport.authenticate('local', (err, userData, info) => {
        var duration;
        if (err) {
          return next(err);
        }
        
        if (!userData) {
          logger.warn("login attempt fails: ", info);
          return res.status(403).json(info);
        }

        // Alter user cookie depending on passed-in option

        if (req.body.remember === 'on') {
          duration = 1000 * 60 * 60 * 24 * parseInt(meta.config.loginDays || 14, 10);
          req.session.cookie.maxAge = duration;
          logger.warn("Saving session for: " + duration + "ms");
        } else {
          duration = 1000 * 60 * 60 * 8;
          req.session.cookie.maxAge = duration;
        }
        // Not the whole user data: its access key stays out of the logs
        logger.info("Connecting: ", userData.uid);
        if (userData.settings){
          req.session = _.extend(req.session, userData.settings);
        }

        if (userData.settings && userData.settings.locale){
          req.session.locale = userData.settings.locale;
        } else {
          req.session.locale = nconf.get("defaultLocale");
        }

        user.isAdministrator(userData.uid, (err, admin) => {
          userData.administrator = admin;
          var userBean = {
            uid: userData.uid,
            username: req.body.username,
            tokenId: userData.security,
            administrator: userData.administrator,
            token: req.passport
          };
          req.logIn(userBean, () => {
            if (userData.uid) {
              //user.logIP(userData.uid, req.ip);
              logger.info("user '" + userData.uid + "' connected on: " + req.ip);
              communication.setStatus(userBean.username, 'online');
              setTimeout(function(){
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

            if (fs.existsSync(folderScanning.path)){
              library.addFolder(folderScanning, (scanResults) => {
                if ( scanResults.audio ) {
                  req.session.library = scanResults;
                  logger.info(scanResults);
                  middleware.sessionSave(req);
                }
              });
            }

            res.json({
              msg: 'authenticated',
              user: userBean
            });
          });
        });
      })(req, res, next);
    };

  /**
   * Sign up, while the number of accounts is under the "allowRegisteration" setting:
   * { username, email, password, confirmPassword }. The new user is signed in.
   */
  register (req, res) {
    const body = req.body || {};
    user.count((err, usercount) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      meta.settings.getOne("global", "allowRegisteration", (err, val) => {
        if (err || !(usercount < (parseInt(val, 10) || 0))) {
          return res.status(403).json({ message: 'Sign up is closed on this server' });
        }
        const invalid = invalidAccountFields(body);
        if (invalid) {
          return res.status(400).json({ message: invalid });
        }
        if (body.password !== body.confirmPassword) {
          return res.status(400).json({ message: 'The password and its confirmation are different' });
        }
        const userData = { username: body.username, password: body.password, email: body.email.trim(), ip: req.ip };
        user.create(userData, (err, uid) => {
          if (err === 'already exists username') {
            return res.status(409).json({ message: 'This user name is already used' });
          }
          if (err === 'already exists email') {
            return res.status(409).json({ message: 'This e-mail is already used' });
          }
          if (err || !uid) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
          }
          // The same session as a login: the session guard checks the username
          req.session.cookie.maxAge = 1000 * 60 * 60 * 8;
          req.logIn({ uid: uid, username: userData.username, administrator: false }, (err) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Internal server error' });
            }
            communication.setStatus(userData.username, 'online');
            res.json({ message: 'OK', user: { uid: uid, username: userData.username, administrator: false } });
          });
        });
      });
    });
  };

  login (username, password, done) {
    if (!username || !password) {

      statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment', () => {
        console.debug("Stats saved");
      });
      return done(new Error('[[error:invalid-user-data]]'));
    }

    user.getUidByUsername(username.trim(), (err, uid) => {
      if (err) {
        return done(err);
      }
      if (!uid) {

        statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment', () => {
          console.debug("Stats saved");
        });
        // To-do: Even if a user doesn't exist, compare passwords anyway, so we don't immediately return
        return done(null, false, '[[error:no-user]]');
      }

      user.auth.logAttempt(uid, (err) => {
        if (err) {
          if ("[[error:account-locked]]" === err.message){
            return done(null, false, {
              code: '417',
              message: err.message
            });
          } else {
            return done(null, false, err.message);
          }
        }

        db.getObjectFields('user:' + uid, ['password', 'banned'], (err, userData) => {
          if (err) {
            return done(err);
          }

          if (!userData || !userData.password) {
            statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment', () => {
              console.debug("Stats saved");
            });
            return done(new Error('[[error:invalid-user-data]]'));
          }

          if (userData.banned && parseInt(userData.banned, 10) === 1) {
            return done(null, false, {
              code: 403,
              message: '[[error:user-banned]]'
            });
          }

          bcrypt.compare(password, userData.password, (err, res) => {
            if (err) {
              return done(new Error('bcrypt compare error'));
            }
            if (!res) {
              statistics.set('failed-logins', moment().startOf('day').format('x'), 'increment', () => {
                console.debug("Stats saved");
              });
              return done(null, false, {
                code: 401,
                message: '[[error:invalid-password]]'});
            }

            user.auth.clearLoginAttempts(uid);

            async.auto({
              settings: (next) => {
                user.getSettings(uid, next);
              },
              security: (next) => {
                security.getAccessId(uid, next);
              }
            }, (err, results) => {
              done(null, {
                uid: uid,
                settings: results.settings,
                security: results.security
              }, '[[success:authentication-successful]]');
            });

          });
        });
      });
    });
  };
}

module.exports = new Authority();
