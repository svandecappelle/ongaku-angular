/*jslint node: true */
'use strict';

var db = require('../index');

/**
 * Playlists of a user:
 * - `<username>:playlists`: set of the playlist names
 * - `<username>:playlist:<name>`: list of the track uids, in order (a track can be there several times)
 * - `<username>:playlists:updated`: hash of the last change time of each playlist (ms)
 */
class PlaylistRedisModel {
  listKey (username, playlist) {
    return username + ':playlist:' + playlist;
  }

  updatedKey (username) {
    return username + ':playlists:updated';
  }

  getPlaylists (username, callback) {
    db.getSetMembers(username + ':playlists', callback);
  }

  /** Last change time of every playlist, by name */
  getUpdated (username, callback) {
    db.getObject(this.updatedKey(username), (err, updated) => callback(err, updated || {}));
  }

  exists (username, playlist, callback) {
    db.isSetMember(username + ':playlists', playlist, callback);
  }

  getPlaylistContent (username, playlist, callback) {
    db.getListRange(this.listKey(username, playlist), 0, -1, (err, uids) => callback(err, uids || []));
  }

  /** Create the playlist with these tracks */
  create (username, playlist, uids, callback) {
    var multi = db.client.multi();
    multi.sadd(username + ':playlists', playlist);
    multi.del(this.listKey(username, playlist));
    if (uids.length) {
      multi.rpush(this.listKey(username, playlist), uids);
    }
    multi.hset(this.updatedKey(username), playlist, Date.now());
    multi.exec((err) => callback(err));
  }

  /** Replace the tracks of the playlist (removal, reordering) */
  setTracks (username, playlist, uids, callback) {
    this.create(username, playlist, uids, callback);
  }

  /** Add tracks at the end of the playlist */
  append (username, playlist, uids, callback) {
    var multi = db.client.multi();
    if (uids.length) {
      multi.rpush(this.listKey(username, playlist), uids);
    }
    multi.hset(this.updatedKey(username), playlist, Date.now());
    multi.exec((err) => callback(err));
  }

  rename (username, playlist, name, callback) {
    db.exists(this.listKey(username, playlist), (err, hasTracks) => {
      if (err) {
        return callback(err);
      }
      var multi = db.client.multi();
      multi.srem(username + ':playlists', playlist);
      multi.sadd(username + ':playlists', name);
      // An empty playlist has no list
      if (hasTracks) {
        multi.rename(this.listKey(username, playlist), this.listKey(username, name));
      }
      multi.hdel(this.updatedKey(username), playlist);
      multi.hset(this.updatedKey(username), name, Date.now());
      multi.exec((err) => callback(err));
    });
  }

  remove (username, playlist, callback) {
    var multi = db.client.multi();
    multi.srem(username + ':playlists', playlist);
    multi.del(this.listKey(username, playlist));
    multi.hdel(this.updatedKey(username), playlist);
    multi.exec((err) => callback(err));
  }
}

module.exports = PlaylistRedisModel;
