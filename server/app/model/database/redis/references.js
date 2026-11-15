/*jslint node: true */
'use strict';

var async = require('async');
var db = require('../index');

/**
 * Removes deleted tracks from what the users saved (library, likes, playlists) and from
 * the play counts, so that they are not counted as missing.
 */
function purgeTracks(uids, callback) {
  if (!uids.length) {
    return callback();
  }
  db.getObject('username:uid', (err, usernames) => {
    if (err) {
      return callback(err);
    }
    async.eachSeries(Object.keys(usernames || {}), (username, next) => {
      db.getSetMembers(username + ':playlists', (err, playlists) => {
        if (err) {
          return next(err);
        }
        var multi = db.client.multi();
        multi.srem(username + ':library', uids);
        multi.zrem(username + ':likes', uids);
        (playlists || []).forEach((name) => uids.forEach((uid) => multi.lrem(username + ':playlist:' + name, 0, uid)));
        multi.exec((err) => next(err));
      });
    }, (err) => {
      if (err) {
        return callback(err);
      }
      var multi = db.client.multi();
      multi.hdel('statistics:plays', uids);
      multi.exec((err) => callback(err));
    });
  });
}

/**
 * Tracks of a member moved to another place of his uploads: their uids change (the uid is
 * made from the path), what he saved follows them. `moves`: [[old uid, new uid]]. His
 * library, likes, playlists and history, and the play counts.
 */
function renameTracks(username, moves, callback) {
  var renamed = new Map((moves || []).filter((move) => move[0] !== move[1]));
  if (!renamed.size) {
    return callback();
  }
  var olds = [...renamed.keys()];
  db.getSetMembers(username + ':playlists', (err, playlists) => {
    if (err) {
      return callback(err);
    }
    var read = db.client.multi();
    olds.forEach((uid) => {
      read.sismember(username + ':library', uid);
      read.zscore(username + ':likes', uid);
      read.hget('statistics:plays', uid);
    });
    (playlists || []).forEach((name) => read.lrange(username + ':playlist:' + name, 0, -1));
    read.lrange(username + ':history', 0, -1);
    read.exec((err, replies) => {
      if (err) {
        return callback(err);
      }
      var write = db.client.multi();
      olds.forEach((uid, i) => {
        var next = renamed.get(uid);
        var [inLibrary, likeScore, plays] = replies.slice(i * 3, i * 3 + 3);
        if (Number(inLibrary)) {
          write.srem(username + ':library', uid);
          write.sadd(username + ':library', next);
        }
        if (likeScore !== null && likeScore !== undefined) {
          write.zrem(username + ':likes', uid);
          write.zadd(username + ':likes', likeScore, next);
        }
        if (plays !== null && plays !== undefined) {
          write.hdel('statistics:plays', uid);
          write.hincrby('statistics:plays', next, Number(plays) || 0);
        }
      });
      var offset = olds.length * 3;
      (playlists || []).forEach((name, i) => {
        (replies[offset + i] || []).forEach((uid, index) => {
          if (renamed.has(uid)) {
            write.lset(username + ':playlist:' + name, index, renamed.get(uid));
          }
        });
      });
      (replies[offset + (playlists || []).length] || []).forEach((entry, index) => {
        try {
          var play = JSON.parse(entry);
          if (renamed.has(play.uid)) {
            play.uid = renamed.get(play.uid);
            write.lset(username + ':history', index, JSON.stringify(play));
          }
        } catch (e) {
          // Not a play: left as it is
        }
      });
      write.exec((err) => callback(err));
    });
  });
}

module.exports = { purgeTracks, renameTracks };
