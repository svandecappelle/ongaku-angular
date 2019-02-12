const nconf = require('nconf');
const path = require('path');
const semver = require('semver');
const { Config } = require('../sql-models');


var git;
try {
  git = require('nodegit');
} catch (error) {
  git = require('./../middleware/git');
  console.warn('Git plugin not installed.');
}

class Version {

  current() {
    return require(path.resolve(__dirname, '../../../package')).version;
  }

  async sha() {
    if (git.Repository) {
      return await git.Repository.open(path.resolve(__dirname, '../../../')).then((repo) => {
        return repo.getHeadCommit();
      }).then(commit => {
        return commit.sha();
      });
    } else {
      return git.version();
    }
  }

  installed() {
    return new Promise((resolve, reject) => {
      if (nconf.get('database') === 'redis') {
        const groups = require('../model/groups');
        groups.getAllGroups((err, groups) => {
          resolve(!err && groups.length > 0 ? this.current(): null);
        });
      } else {
        Config.findAll().then(properties => {
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
      }
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
