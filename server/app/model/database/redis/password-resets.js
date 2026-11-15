/*jslint node: true */
'use strict';

var db = require('../index');

var RESETS = 'password-resets';
var BY_USER = 'password-resets:users';
var CLAIMS = 'password-resets:claims';

/**
 * Password reset links made by the administrators, one at a time for each account:
 *  - `password-resets`: hash of the links, token -> JSON { token, uid, username, createdBy,
 *    created, expires, usedAt };
 *  - `password-resets:users`: hash uid -> the token of his link (a new link replaces it);
 *  - `password-resets:claims`: hash of the links being used (HSETNX: once).
 */
class PasswordResetsRedisModel {
  parse (value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  }

  /** Saves a new link of an account, the former one stops working */
  replace (reset, callback) {
    db.getObjectField(BY_USER, reset.uid, (err, former) => {
      if (err) {
        return callback(err);
      }
      var multi = db.client.multi();
      if (former) {
        multi.hdel(RESETS, former);
        multi.hdel(CLAIMS, former);
      }
      multi.hset(RESETS, reset.token, JSON.stringify(reset));
      multi.hset(BY_USER, reset.uid, reset.token);
      multi.exec((err) => callback(err));
    });
  }

  get (token, callback) {
    db.getObjectField(RESETS, token, (err, value) => callback(err, this.parse(value)));
  }

  /** The link waiting for an account, if any */
  ofUser (uid, callback) {
    db.getObjectField(BY_USER, uid, (err, token) => {
      if (err || !token) {
        return callback(err, null);
      }
      this.get(token, callback);
    });
  }

  save (reset, callback) {
    db.setObjectField(RESETS, reset.token, JSON.stringify(reset), (err) => callback(err));
  }

  /** The link of an account stops working (revoked, used, account deleted) */
  removeOfUser (uid, callback) {
    db.getObjectField(BY_USER, uid, (err, token) => {
      if (err) {
        return callback(err);
      }
      var multi = db.client.multi();
      if (token) {
        multi.hdel(RESETS, token);
        multi.hdel(CLAIMS, token);
      }
      multi.hdel(BY_USER, uid);
      multi.exec((err) => callback(err));
    });
  }

  claim (token, callback) {
    db.client.hsetnx(CLAIMS, token, String(Date.now()), (err, set) => callback(err, Number(set) === 1));
  }

  release (token, callback) {
    db.deleteObjectField(CLAIMS, token, (err) => callback(err));
  }
}

module.exports = PasswordResetsRedisModel;
