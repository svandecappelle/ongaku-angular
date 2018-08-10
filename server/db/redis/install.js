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

      user.getUsers([opts.email], function (err, data) {
        console.info("Installed", data);
        user.create({ email: opts.email, username: opts.username, password: opts.password }, function (err, uuid) {
          if (err) {
            console.error("Error while create user: " + err);
            reject(err);
          } else {
            console.info("Success create user: " + uuid);
          }
          groups.join("administrators", opts.email, function (err) {
            if (err) {
              console.error(err);
              reject(err);
            }
            console.info("Installed");
            resolve();
          });
        });
      });
    });
  }
}

module.exports = new Installer();