const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/config`);

class ConfigModel extends model {

    constructor () {
        super();
    }
}

module.exports = new ConfigModel();