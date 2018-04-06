const nconf = require("nconf");
const primaryDBName = nconf.get('database');
const model = require(`./database/redis/user`);

class UserModel extends model {

    constructor () {
        super();
    }
}

module.exports = new UserModel();