const nconf = require("nconf");
const _ = require('underscore');
const { User, UserSettings } = require("./models");

class UserAuth {
    logAttempt(uid) {
        return new Promise(resolve => {
            // "[[error:account-locked]]" for locked
            resolve();
        });
    }

    clearLoginAttempts(uid) {
        return User.update({banned: false}, {where: {id: uid}});
    }
}

class UserModel {

    constructor () {
        this.auth = new UserAuth();
    }

    getUidByUsername(username) {
        return User.findOne({where: {'username': username}, raw: true})
            .then(user => user ? user.id: null);
    }

    get(uid, datas) {
        return User.findOne({where: {id: uid}, raw: true}).then((userData) => {
            return _.pick(userData, datas);
        });
    }

    isAdministrator(uid) {
        // TODO reactive that
        return new Promise((resolve, reject) => {
            resolve(true)
        });
    }

    getSettings(uid) {
        return UserSettings.findAll({
            where: {
                owner: uid
            },
            raw: true
        }).then((rows) => {
            return _.map(rows, row => _.object([row.property], [row.value])).reduce((obj, current) => {
                for(var key in current) {
                    if (current.hasOwnProperty(key)) {
                        obj[key] = current[key];
                    }
                }
                return obj;
            }, {});
        });
    }

    setSettings(uid, settings) {
        const rows = _.map(_.pairs(settings), rowSetting => {
            return new Promise((resolve, reject) => { 
                UserSettings.findOrCreate({
                    where: {
                        owner: uid,
                        property: rowSetting[0]
                    }, 
                    defaults: {
                        value: rowSetting[1]
                    }
                }).then((results) => {
                    if (!results[1]) {
                        return UserSettings.update({
                            value: rowSetting[1]
                        }, {
                            where: {
                                owner: uid,
                                property: rowSetting[0]
                            }
                        }).then(resolve)
                        .catch(reject);
                    }
                    return resolve();
                }).catch(reject);
            });
        });
        return Promise.all(rows);
    }
}

module.exports = UserModel;