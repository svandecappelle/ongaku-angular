const APPLICATION_ID = "ongaku";
const _ = require('underscore');
const forever = require('forever');

class Application {
  start() {
    return new Promise((resolve) => {
      forever.start(__dirname + '/index.js', {
        uid: APPLICATION_ID,
        stream: true
      });
      resolve();
    });
  };

  stop() {
    return new Promise((resolve) => {
      this.getRunningPid(function (err, app) {
        if (!err && app) {
          process.stdout.write('Stopping "' + app.uid + '": ["' + app.pid + '"]!\n')
          forever.stop(app.index);
          process.stdout.write('Stopping "' + app.uid + '". Goodbye!\n');
        } else {
          process.stdout.write(app.uid + ' is already stopped.\n');
        }
        resolve();
      });
    });
  };

  status() {
    return new Promise((resolve, reject) => {
      this.getRunningPid().then((err, app) => {
        if (!err && app) {
          process.stdout.write('\n' + APPLICATION_ID + ' Running '.bold + '(pid '.cyan + app.pid.toString().cyan + ')\n'.cyan);
          process.stdout.write('\t"' + './ongaku stop'.yellow + '" to stop the ' + APPLICATION_ID + ' server\n');
          process.stdout.write('\t"' + './ongaku log'.yellow + '" to view server ' + APPLICATION_ID + '\n');
          process.stdout.write('\t"' + './ongaku restart'.yellow + '" to restart ' + APPLICATION_ID + '\n\n');
        } else {
          process.stdout.write('\n' + APPLICATION_ID + ' is not running\n'.bold);
          process.stdout.write('\t"' + './ongaku start'.yellow + '" to launch the ' + APPLICATION_ID + ' server\n\n'.reset);
        }
        resolve();
      }).catch(error => reject(error));
    });
  };

  getRunningPid() {
    return new Promise((resolve, reject) => {
      forever.list(false, function (err, processes) {
        var ongaku;
        if (processes) {
          ongaku = _.findWhere(processes, { uid: APPLICATION_ID });
          ongaku.index = _.indexOf(processes, ongaku);
          var pid = ongaku.pid;
          resolve(ongaku)
        } else {
          reject(reject)
        }
      });
    });
  };

  restart() {
    return new Promise((resolve, reject) => {
      var that = this;
      this.stop().then(() => {
        that.start().then(() => {
          resolve();
        }).catch(error => reject(error));
      }).catch(error => reject(error));
    });
  };
}

const app = new Application();
const onError = (error) => {
  console.error(error);
}

forever.load ({
  stream: true
});

switch (process.argv[2]) {
  case 'status':
    app.status().catch(error => onError);
    break
  case 'start':
    app.start();
    break
  case 'stop':
    app.stop();
    break;
  case 'restart':
    app.restart();
    break;
  case 'setup':
    process.stdout.write('\nNot yet implemented\n'.red);
    break;

  case 'upgrade':
    process.stdout.write('\nNot yet implemented\n'.red);
    break;

  default:
    process.stdout.write('\nWelcome to ' + APPLICATION_ID + '\n\n'.bold);
    process.stdout.write('Usage: ./ongaku {start|stop|reload|restart|log|setup|reset|upgrade|dev}\n\n');
    process.stdout.write('\t' + 'start'.yellow + '\tStart the ' + APPLICATION_ID + ' server\n');
    process.stdout.write('\t' + 'stop'.yellow + '\tStops the ' + APPLICATION_ID + ' server\n');
    process.stdout.write('\t' + 'restart'.yellow + '\tRestarts ' + APPLICATION_ID + '\n');
    process.stdout.write('\t' + 'setup'.yellow + '\tRuns the ' + APPLICATION_ID + ' setup script\n');
    process.stdout.write('\t' + 'upgrade'.yellow + '\tRun ' + APPLICATION_ID + ' upgrade scripts, ensure packages are up-to-date\n');
    process.stdout.write('\t' + 'dev'.yellow + '\tStart ' + APPLICATION_ID + ' in interactive development mode\n');
    process.stdout.write('\t' + 'watch'.yellow + '\tStart ' + APPLICATION_ID + ' in development mode and watch for changes\n');
    process.stdout.write('\n'.reset);
    break;
}
