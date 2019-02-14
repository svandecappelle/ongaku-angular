const nconf = require('nconf');
const objectAssign = require('object-assign');
const _ = require('underscore');
const db = require('./database');


function mergeConfiguration(redisConfig) {
    var jsonConfiguration = nconf.get();
    var mergedConfig = objectAssign(jsonConfiguration, redisConfig);
    return mergedConfig;
}

function mergeOnNconf(redisConfig) {
    var jsonConfiguration = nconf.get();
    _.each(redisConfig, function (val, key) {
        nconf.set(key, val);
    });
}

class Config {

    merge() {
        var hash = 'settings:global';
        db.getObject(hash, function (err, settings) {
            if (err) {
                callback(err);
            } else {
                mergeOnNconf(settings || {});
            }
        });
    };

    get(hash, callback) {
        hash = 'settings:' + hash;
        db.getObject(hash, function (err, settings) {
            if (err) {
                callback(err);
            } else {
                callback(null, mergeConfiguration(settings || {}));
            }
        });
    };

    getOne(hash, field, callback) {
        hash = 'settings:' + hash;
        db.getObjectField(hash, field, callback);
    };

    set(hash, values, callback) {
        hash = 'settings:' + hash;
        db.setObject(hash, values, callback);
    };

    setOne(hash, field, value, callback) {
        hash = 'settings:' + hash;
        nconf.set(field, value);
        db.setObjectField(hash, field, value, callback);
    };

    setOnEmpty(hash, field, value, callback) {
        getOne(hash, field, function (err, curValue) {
            if (err) {
                return callback(err);
            }

            if (!curValue) {
                setOne(hash, field, value, callback);
            } else {
                callback();
            }
        });
    };
}

module.exports = Config;
