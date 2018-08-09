const user = require("../../app/model/user");
const groups = require("../../app/model/groups");
const meta = require('../../app/meta');

class Installer {

  install(opts) {
    return new Promise((resolve, reject) => {
      meta.settings.setOne("global", "requireLogin", "true", function (err) {
        if (err) {
          console.debug("userauth error initialising");
          reject(err);
        }
        console.info("Standard global settings initialised");
      });


      user.create({ email: "admin@domain.fr", username: "admin", password: "admin" }, function (err, uuid) {
        if (err) {
          console.error("Error while create user: " + err);
          reject(err);
        } else {
          console.info("Success create user: " + uuid);
        }
        user.getUsers(["admin@domain.fr"], function (err, data) {
          console.info("Installed");
          resolve();
        });

        groups.join("administrators", "admin@domain.fr", function (err) {
          if (err) {
            console.error(err);
            reject(err);
          }
          console.info("User admin configured as administrator");
        });
      });
    });
  }
}

module.exports = new Installer();