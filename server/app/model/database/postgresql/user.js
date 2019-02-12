const nconf = require("nconf");
const { User } = require("./models")

class UserAuth {
    logAttempt(uid, callback) {
        callback();
    }
}

class UserModel {

    constructor () {
        this.auth = new UserAuth();
    }

    getUidByUsername(username, callback) {
        User.findOne({where: {'username': username}, raw: true}).then((user) => {
            if (user) {
                callback(user);
            } else {
                callback(null, {'msg': 'user not exists'})
            }
        }).catch((error) => {
            callback(null, error);
        });
    }
}

module.exports = UserModel;