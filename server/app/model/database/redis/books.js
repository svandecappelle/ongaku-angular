/*jslint node: true */
'use strict';

var db = require('../index');

/**
 * Where a user is in his books: hash `<username>:books:progress`, by book uid, of
 * { position, percent, updated } as JSON. `position` is told by the reader (a page of a PDF,
 * a place of an EPUB), `percent` goes from 0 to 1, `updated` is a time in ms.
 */
class BooksRedisModel {
  key (username) {
    return username + ':books:progress';
  }

  parse (value) {
    try {
      var progress = JSON.parse(value);
      return progress && typeof progress === 'object' ? progress : null;
    } catch (err) {
      return null;
    }
  }

  /** Every book the user opened: { uid: progress } */
  all (username, callback) {
    db.getObject(this.key(username), (err, stored) => {
      if (err) {
        return callback(err);
      }
      var result = {};
      Object.keys(stored || {}).forEach((uid) => {
        var progress = this.parse(stored[uid]);
        if (progress) {
          result[uid] = progress;
        }
      });
      callback(null, result);
    });
  }

  get (username, uid, callback) {
    db.getObjectField(this.key(username), uid, (err, value) => callback(err, value ? this.parse(value) : null));
  }

  set (username, uid, progress, callback) {
    db.setObjectField(this.key(username), uid, JSON.stringify(progress), callback);
  }

  remove (username, uid, callback) {
    db.deleteObjectField(this.key(username), uid, callback);
  }

  /** Books moved or renamed (their uids are made from their paths): `moves` is [[old uid, new uid]] */
  rename (username, moves, callback) {
    var renamed = (moves || []).filter((move) => move[0] !== move[1]);
    if (!renamed.length) {
      return callback();
    }
    var read = db.client.multi();
    renamed.forEach((move) => read.hget(this.key(username), move[0]));
    read.exec((err, values) => {
      if (err) {
        return callback(err);
      }
      var write = db.client.multi();
      renamed.forEach((move, i) => {
        if (values[i] !== null && values[i] !== undefined) {
          write.hdel(this.key(username), move[0]);
          write.hset(this.key(username), move[1], values[i]);
        }
      });
      write.exec((err) => callback(err));
    });
  }
}

module.exports = BooksRedisModel;
