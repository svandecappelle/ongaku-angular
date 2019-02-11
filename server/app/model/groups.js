const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/groups`);

class GroupsModel extends model {

    constructor () {
        super();
    }
}

module.exports = new GroupsModel();