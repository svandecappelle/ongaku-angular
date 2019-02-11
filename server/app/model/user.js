const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/user`);

class UserModel extends model {

    constructor () {
        super();
    }
}

module.exports = new UserModel();