const nconf = require("nconf");
const dbtype = nconf.get('database');
const model = require(`./database/${dbtype}/library`);

class LibraryModel extends model {


  constructor() {
    super()
  }

}

module.exports = new LibraryModel();