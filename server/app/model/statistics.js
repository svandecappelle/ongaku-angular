const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/statistics`);

class StatisticsModel extends model {

    constructor () {
        super();
    }
}

module.exports = new StatisticsModel();