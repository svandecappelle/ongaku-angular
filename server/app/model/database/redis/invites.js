/*jslint node: true */
'use strict';

var db = require('../index');

var INVITES = 'invites';
var CLAIMS = 'invites:claims';

/**
 * Join links made by the administrators: each one creates a single account, even when sign up
 * is closed.
 *  - `invites`: hash of the links, token -> JSON { token, createdBy, note, created, expires,
 *    usedBy, usedAt };
 *  - `invites:claims`: hash of the links being used, token -> username: the first sign up to
 *    claim a link gets it (HSETNX), the others are refused.
 */
class InvitesRedisModel {
  parse (value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  }

  save (invite, callback) {
    db.setObjectField(INVITES, invite.token, JSON.stringify(invite), (err) => callback(err));
  }

  get (token, callback) {
    db.getObjectField(INVITES, token, (err, value) => callback(err, this.parse(value)));
  }

  /** Every link, the latest first */
  list (callback) {
    db.getObject(INVITES, (err, all) => {
      if (err) {
        return callback(err);
      }
      var invites = Object.keys(all || {}).map((token) => this.parse(all[token])).filter(Boolean);
      invites.sort((a, b) => b.created - a.created);
      callback(null, invites);
    });
  }

  remove (token, callback) {
    var multi = db.client.multi();
    multi.hdel(INVITES, token);
    multi.hdel(CLAIMS, token);
    multi.exec((err) => callback(err));
  }

  /** Takes the link for a sign up; false when another one has it already */
  claim (token, username, callback) {
    db.client.hsetnx(CLAIMS, token, username, (err, set) => callback(err, Number(set) === 1));
  }

  /** The sign up failed (the name is taken...): the link can be used again */
  release (token, callback) {
    db.deleteObjectField(CLAIMS, token, (err) => callback(err));
  }
}

module.exports = InvitesRedisModel;
