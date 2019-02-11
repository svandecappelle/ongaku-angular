const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/security`);

class SecurityModel extends model {

    constructor () {
        super();
    }
}

module.exports = new SecurityModel();