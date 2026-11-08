/*jslint node: true */
'use strict';

var db = require('../index');

var STATIONS = 'radios:stations';

/**
 * Internet radio stations, shared by every member:
 *  - `radios:stations`: hash of the stations, id -> JSON { id, name, url, genre, createdBy, createdAt };
 *  - `<username>:radio-favourites`: set of the ids a user marked as favourite.
 */
class RadiosRedisModel {
  favouritesKey (username) {
    return username + ':radio-favourites';
  }

  /** Every station, by name */
  list (callback) {
    db.getObject(STATIONS, (err, stations) => {
      if (err) {
        return callback(err);
      }
      var list = Object.keys(stations || {}).map((id) => {
        try {
          return JSON.parse(stations[id]);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      callback(null, list);
    });
  }

  get (id, callback) {
    db.getObjectField(STATIONS, id, (err, value) => {
      if (err || !value) {
        return callback(err, null);
      }
      try {
        callback(null, JSON.parse(value));
      } catch (e) {
        callback(null, null);
      }
    });
  }

  save (station, callback) {
    db.setObjectField(STATIONS, station.id, JSON.stringify(station), (err) => callback(err));
  }

  remove (id, callback) {
    db.deleteObjectField(STATIONS, id, (err) => callback(err));
  }

  favourites (username, callback) {
    db.getSetMembers(this.favouritesKey(username), (err, ids) => callback(err, ids || []));
  }

  setFavourite (username, id, favourite, callback) {
    if (favourite) {
      db.setAdd(this.favouritesKey(username), id, (err) => callback(err));
    } else {
      db.setRemove(this.favouritesKey(username), id, (err) => callback(err));
    }
  }
}

module.exports = RadiosRedisModel;
