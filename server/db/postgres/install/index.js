const fs = require('fs');
const path = require('path');
const dateFormat = require('dateformat');
const models = require(path.resolve(__dirname, '../../../app/models'));
const async = require('async');
const bcrypt = require('bcrypt');

const version = require(path.resolve(__dirname, '../../../app/utils/version'));

class Installer {

  getFiles() {
    return fs.readdirSync(__dirname)
      .filter(function(file) {
        return file.indexOf(".sql") !== -1;
      })
  }

  install(){
    return new Promise((resolve, reject) => {
      var sqlFiles = this.getFiles();
      async.eachSeries(sqlFiles, (file, next) => {
        var sqlFileContent = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
        // console.log("Executing: ", sqlFileContent);
        models.sequelize.query(sqlFileContent,
          {
            raw: true
          }
        ).then( () => {
          console.log("** query success ** ");
          next();
        }).catch ( (error) => {
          // TODO check on error to retry errors and have an incremental install
          next({
            msg: 'Error installing application',
            details: error
          });
        });
      }, (error) => {
        if (error) {
          console.error(error);
          return reject(error);
        }
        console.log(`schema successfully installed ${version.current()}`);

        this.inserts().then(() => {
          resolve(true);
        }).catch(() => {
          reject();
        });

      });
    });
  }

  inserts () {
    return new Promise((resolve, reject) => {
      async.series({
        startInstall: function (next){
          models.Pricing.create({ property: 'installed_at', value: dateFormat()}).then(() => {
            next(null, 'ok');
          });
        },
        administators: function (next) {
          var salt = bcrypt.genSaltSync(10);
          var hash = bcrypt.hashSync("admin", salt);

          models.User.create({ username: 'admin', password: hash}).then(() => {
            next(null, 'ok');
          });
        },
        groups: function (next) {
          models.Group.create({ name: 'administators' }).then(() => {
            next(null, 'ok');
          });
        },
        assignAdministrators: function (next){
          models.Group.findOne({ where: {name: 'administators'}}).then( (group) => {
            models.User.findOne({ where: {username: 'admin'}}).then( (user) => {
              user.addGroup(group);
              next(null, 'ok');
            });
          });
        },
        history: function (next) {
          models.Installations.create({version: version.current()}).then( () => {
            next();
          }).catch( (error) => {
            next(error);
          });
        }
      }, () => {
        models.Pricing.create({ property: 'version', value: version.current()}).then( () => {
          console.log('database successfully installed');
          resolve(true);
        });
      })
    })




  }
}

module.exports = new Installer();
