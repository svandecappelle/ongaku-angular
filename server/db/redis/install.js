const user = require("../../app/model/user");
const groups = require("../../app/model/groups");
const meta = require('../../app/meta');
const logger = require('log4js').getLogger('RedisInstaller');

class Installer {

  install(opts) {
    return new Promise((resolve, reject) => {
      meta.settings.setOne("global", "requireLogin", "true", function (err) {
        if (err) {
          logger.debug("userauth error initialising");
          reject(err);
        }
        logger.info("Standard global settings initialised");
      });


      user.create({ email: "admin@domain.fr", username: "admin", password: "admin" }, function (err, uuid) {
        if (err) {
          logger.error("Error while create user: " + err);
          reject(err);
        } else {
          logger.info("Success create user: " + uuid);
        }
        user.getUsers(["admin@domain.fr"], function (err, data) {
          logger.info("Installed");
          resolve();
        });

        groups.join("administrators", "admin@domain.fr", function (err) {
          if (err) {
            logger.error(err);
            reject(err);
          }
          logger.info("User admin configured as administrator");
        });
      });
    });
  }
}

module.exports = new Installer();