/*jslint node: true */
'use strict';

var db = require('../index');

/** Plays kept in the list of recent plays */
var MAX_ENTRIES = 500;

/**
 * Listening history of a user:
 *  - `<username>:history`: list of the last plays, newest first, as JSON { uid, at (ms) };
 *  - `<username>:history:stats`: hash of counters, `plays:<YYYY-MM>`, `seconds:<YYYY-MM>`
 *    and `day:<YYYY-MM-DD>` (plays of that day);
 *  - `<username>:history:artists:<YYYY-MM>`: sorted set of the plays of each artist that month.
 * Months and days are in the time zone of the server.
 */
class HistoryRedisModel {
  listKey (username) {
    return username + ':history';
  }

  statsKey (username) {
    return username + ':history:stats';
  }

  artistsKey (username, month) {
    return username + ':history:artists:' + month;
  }

  /**
   * Records a play. `play`: { uid, at (ms), month (YYYY-MM), day (YYYY-MM-DD), seconds, artist }.
   */
  add (username, play, callback) {
    var multi = db.client.multi();
    multi.lpush(this.listKey(username), JSON.stringify({ uid: play.uid, at: play.at }));
    multi.ltrim(this.listKey(username), 0, MAX_ENTRIES - 1);
    multi.hincrby(this.statsKey(username), 'plays:' + play.month, 1);
    multi.hincrby(this.statsKey(username), 'seconds:' + play.month, Math.round(play.seconds) || 0);
    multi.hincrby(this.statsKey(username), 'day:' + play.day, 1);
    if (play.artist) {
      multi.zincrby(this.artistsKey(username, play.month), 1, play.artist);
    }
    multi.exec((err) => callback(err));
  }

  /** The last plays, newest first: [{ uid, at }] */
  recent (username, count, callback) {
    db.getListRange(this.listKey(username), 0, count - 1, (err, entries) => {
      if (err) {
        return callback(err);
      }
      var plays = (entries || []).map((entry) => {
        try {
          return JSON.parse(entry);
        } catch (e) {
          return null;
        }
      }).filter((play) => play && typeof play.uid === 'string');
      callback(null, plays);
    });
  }

  /** The counters of the hash: { 'plays:2026-11': 12, … } */
  counters (username, callback) {
    db.getObject(this.statsKey(username), (err, stats) => callback(err, stats || {}));
  }

  /** Artists of a month with their plays, the most played first: [{ value, score }] */
  topArtists (username, month, count, callback) {
    db.getSortedSetRevRangeWithScores(this.artistsKey(username, month), 0, count - 1, (err, entries) => callback(err, entries || []));
  }

  /** Forgets the whole history of a user */
  clear (username, callback) {
    this.counters(username, (err, stats) => {
      if (err) {
        return callback(err);
      }
      var months = Object.keys(stats)
        .filter((field) => field.indexOf('plays:') === 0)
        .map((field) => this.artistsKey(username, field.slice('plays:'.length)));
      db.deleteAll([this.listKey(username), this.statsKey(username)].concat(months), callback);
    });
  }
}

module.exports = HistoryRedisModel;
