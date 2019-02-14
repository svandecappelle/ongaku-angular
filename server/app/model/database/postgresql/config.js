const nconf = require('nconf');
const objectAssign = require('object-assign');
const _ = require('underscore');
// const db = require('./database');

const { Config } = require("./models");


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

class ConfigurationModel {

    merge() {
        var hash = 'settings:global';
/*
        Config.findOne({ where: { 'property': '' }, raw: true }).then((conf) => {
            expect(conf.property).to.equal('installed_at');
            expect(moment(conf.value).startOf('minute').format()).to.equal(installationDate.startOf('minute').format());
            done();
        })
        db.getObject(hash, function (err, settings) {
            if (err) {C
                callback(err);
            } else {
                mergeOnNconf(settings || {});
            }
        });*/
    };

    get(hash) {
        hash = 'settings:' + hash;
        return Config.findAll({raw: true}).then(rows => {
            return _.map(rows, row => _.object([row.property], [row.value])).reduce((obj, current) => {
                for(var key in current) {
                    if (current.hasOwnProperty(key)) {
                        obj[key] = current[key];
                    }
                }
                return obj;
            }, {});
        });
    };

    getOne(hash, field) {
        hash = 'settings:' + hash;
        // db.getObjectField(hash, field, callback);
        return Config.findAll({where: {property: field}, raw: true}).then(rows => {
            return _.map(rows, row => _.object([row.property], [row.value])).reduce((obj, current) => {
                for(var key in current) {
                    if (current.hasOwnProperty(key)) {
                        obj[key] = current[key];
                    }
                }
                return obj;
            }, {});
        });
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

module.exports = ConfigurationModel;
