const config = require('./model/config');

function mergeConfiguration(redisConfig){
    var jsonConfiguration = nconf.get();
    var mergedConfig = objectAssign(jsonConfiguration, redisConfig);
    return mergedConfig;
  }

  function mergeOnNconf(redisConfig){
    var jsonConfiguration = nconf.get();
    _.each(redisConfig, function(val, key){
      nconf.set(key, val);
    });
  }

class Meta {

    constructor() {
        this.restartRequired = false;
        this.config = {
            loginAttempts: 5,
            lockoutDuration: 60,
            loginDays: 14,
            allowLocalLogin: true
        };
        this.settings = config;
    }
}

module.exports = new Meta();