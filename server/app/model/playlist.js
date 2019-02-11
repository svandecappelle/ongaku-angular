const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/playlist`);
class PlaylistModel extends model{
    
    constructor () {
        super();
    }
}

module.exports = new PlaylistModel();
