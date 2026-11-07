/*jslint node: true */
'use strict';

var db = require('../index');

/** Liked tracks of a user: sorted set `<username>:likes`, scored by the time of the like (ms) */
class LikesRedisModel {
  key (username) {
    return username + ':likes';
  }

  /** Uids with their like time, most recent first */
  get (username, callback) {
    db.getSortedSetRevRangeWithScores(this.key(username), 0, -1, (err, entries) => callback(err, entries || []));
  }

  count (username, callback) {
    db.sortedSetCard(this.key(username), callback);
  }

  /** A track liked again keeps its first like time */
  add (username, uids, callback) {
    if (!uids.length) {
      return callback();
    }
    var multi = db.client.multi();
    var now = Date.now();
    uids.forEach((uid) => multi.zadd(this.key(username), 'NX', now, uid));
    multi.exec((err) => callback(err));
  }

  remove (username, uids, callback) {
    if (!uids.length) {
      return callback();
    }
    var multi = db.client.multi();
    multi.zrem(this.key(username), uids);
    multi.exec((err) => callback(err));
  }
}

module.exports = LikesRedisModel;
