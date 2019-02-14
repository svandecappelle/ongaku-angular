const fs = require('fs');
const path = require('path');
const moment = require('moment');
const _ = require('underscore');
const { sequelize, Group, User, Installations, Config } = require(path.resolve(__dirname, '../../../app/sql-models'));
const async = require('async');
const bcrypt = require('bcrypt');

const version = require(path.resolve(__dirname, '../../../app/utils/version'));

class Installer {

  getFiles() {
    return fs.readdirSync(__dirname)
      .filter(function(file) {
        return file.indexOf(".sql") !== -1;
      });
  }

  install() {
    return new Promise((resolve, reject) => {
      var sqlFiles = this.getFiles();
      async.eachSeries(sqlFiles, (file, nextFile) => {
        
        var sqlFileContent = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
        
        const queries = _.filter(_.map(sqlFileContent.split(';'), query => query.trim()), query => query);
        const prom = queries.map((query) => {
            return (nextQuery) => {
              return sequelize.query(query, {
                raw: true
              }).then(() => nextQuery(null, true))
                .catch((err) => nextQuery(err));
            };
        });
        async.series(prom, (err, results) => {
          if (err) {
            return nextFile({
              msg: 'Error installing application',
              details: err
            });
          }
          console.log(`${file} installed`);
          return nextFile(null, true);
        });
      }, (error) => {
        
        if (error) {
          console.error(error);
          return reject(error);
        }
        console.log(`schema successfully installed ${version.current()}`);

        this.inserts().then(() => {
          resolve(true);
        }).catch((err) => {
          reject(err);
        });
      });
    });
  }

  inserts () {
    return new Promise((resolve, reject) => {
      async.series({
        startInstall: function (next){
          Config.create({ property: 'installed_at', value: moment().format()}).then(() => {
            next(null, 'ok');
          }).catch( (error) => {
            next(error);
          });
        },
        administators: function (next) {
          var salt = bcrypt.genSaltSync(10);
          var hash = bcrypt.hashSync("admin", salt);

          User.create({ username: 'admin', password: hash}).then(() => {
            next(null, 'ok');
          }).catch( (error) => {
            next(error);
          });
        },
        groups: function (next) {
          Group.create({ name: 'administators' }).then(() => {
            next(null, 'ok');
          }).catch( (error) => {
            next(error);
          });;
        },
        assignAdministrators: function (next){
          Group.findOne({ where: {name: 'administators'}}).then( (group) => {
            User.findOne({ where: {username: 'admin'}}).then( (user) => {
              return user.addGroup(group, { through: {user_id: user.id, group_id: group.id}});
            }).then(() => {
              next(null, 'ok');
            })
            .catch( (error) => {
              console.error(error);
              next(error);
            });;
          }).catch( (error) => {
            next(error);
          });;
        },
        history: function (next) {
          Installations.create({version: version.current()}).then( () => {
            next(null, 'ok');
          }).catch( (error) => {
            console.error(error);
            next(error);
          });
        }
      }, (error, results) => {
        if (error) {
          return reject(error);
        }
        Config.create({ property: 'version', value: version.current()}).then( () => {
          console.log('database successfully installed');
          resolve(true);
        }).catch( (error) => {
          reject(error);
        });
      })
    })
  }
}

module.exports = new Installer();
