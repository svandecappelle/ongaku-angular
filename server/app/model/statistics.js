const nconf = require("nconf");
const primaryDBName = nconf.get('database');
const model = require(`./database/redis/statistics`);

class StatisticsModel extends model {

    constructor () {
        super();
    }
}

module.exports = new StatisticsModel();