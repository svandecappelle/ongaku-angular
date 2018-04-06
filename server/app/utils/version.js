const nconf = require('nconf');
const path = require('path');
const semver = require('semver');
const models = require('../models');

class Version {

  current() {
    return require(path.resolve(__dirname, '../../../package')).version;
  }

  installed() {
    return new Promise((resolve, reject) => {
      models[nconf.get('product-name')].findAll().then(properties => {
        var application = {};
        for (var variable of properties) {
          application[variable.get('property')] = variable.get('value');
        }
        resolve(application.version);
      }).catch((error) => {
        // console.error(error);
        console.log('not installed application');
        resolve(null);
      });
    });
  }

  check() {
    return new Promise( (resolve, reject) => {
      this.installed().then( (version) => {
        if (!version){
          return resolve({
            installed: false
          });
        }
        resolve({
          installed: version,
          launched: this.current(),
          needUpgrade: semver.gt(this.current(), version),
          versionIsLower: semver.gt(version, this.current())
        });
      }).catch((err) => {
        reject(err);
      })
    });
  }
}

module.exports = new Version();
