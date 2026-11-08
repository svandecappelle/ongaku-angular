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

module.exports = { purgeTracks };
