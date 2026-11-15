/*jslint node: true */
'use strict';

var db = require('../index');

var SHARES = 'shares';
var VIEWS = 'shares:views';

/**
 * Public links to images of a member (see routes/api/shares.js):
 *  - `shares`: hash of the shares, token -> JSON { token, owner, title, paths, created, expires };
 *  - `shares:views`: hash of the openings of each link, token -> count;
 *  - `<username>:shares`: set of the tokens of a member.
 */
class SharesRedisModel {
  ownerKey (username) {
    return username + ':shares';
  }

  parse (value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  }

  create (share, callback) {
    var multi = db.client.multi();
    multi.hset(SHARES, share.token, JSON.stringify(share));
    multi.sadd(this.ownerKey(share.owner), share.token);
    multi.exec((err) => callback(err));
  }

  get (token, callback) {
    db.getObjectField(SHARES, token, (err, value) => callback(err, this.parse(value)));
  }

  /** The shares of a member, with their views, the latest first */
  list (username, callback) {
    db.getSetMembers(this.ownerKey(username), (err, tokens) => {
      if (err || !tokens || !tokens.length) {
        return callback(err, []);
      }
      var multi = db.client.multi();
      tokens.forEach((token) => {
        multi.hget(SHARES, token);
        multi.hget(VIEWS, token);
      });
      multi.exec((err, replies) => {
        if (err) {
          return callback(err);
        }
        var shares = [];
        tokens.forEach((token, i) => {
          var share = this.parse(replies[i * 2]);
          if (share && share.owner === username) {
            share.views = Number(replies[i * 2 + 1]) || 0;
            shares.push(share);
          }
        });
        shares.sort((a, b) => b.created - a.created);
        callback(null, shares);
      });
    });
  }

  remove (username, token, callback) {
    var multi = db.client.multi();
    multi.hdel(SHARES, token);
    multi.hdel(VIEWS, token);
    multi.srem(this.ownerKey(username), token);
    multi.exec((err) => callback(err));
  }

  /** Every share of a member (his account is deleted) */
  removeAll (username, callback) {
    db.getSetMembers(this.ownerKey(username), (err, tokens) => {
      if (err) {
        return callback(err);
      }
      var multi = db.client.multi();
      (tokens || []).forEach((token) => {
        multi.hdel(SHARES, token);
        multi.hdel(VIEWS, token);
      });
      multi.del(this.ownerKey(username));
      multi.exec((err) => callback(err));
    });
  }

  /**
   * Files of a member moved or renamed in his uploads: his links follow them. `moves`:
   * [[old path, new path]], of files or folders (a folder takes the images inside it).
   */
  renamePaths (username, moves, callback) {
    this.list(username, (err, shares) => {
      if (err || !shares.length || !moves.length) {
        return callback(err);
      }
      var multi = db.client.multi();
      shares.forEach((share) => {
        var changed = false;
        share.paths = share.paths.map((item) => {
          for (var [from, to] of moves) {
            if (item === from || item.startsWith(from + '/')) {
              changed = true;
              return to + item.slice(from.length);
            }
          }
          return item;
        });
        if (changed) {
          delete share.views;
          multi.hset(SHARES, share.token, JSON.stringify(share));
        }
      });
      multi.exec((err) => callback(err));
    });
  }

  countView (token, callback) {
    db.incrObjectField(VIEWS, token, (err) => callback(err));
  }
}

module.exports = SharesRedisModel;
