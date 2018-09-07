const { exec } = require('child_process');

class GitUpdater {

    update() {
        return new Promise((resolve, reject) => {
            exec('git pull', (err, stdout, stderr) => {
                if (err) {
                    // node couldn't execute the command
                    return reject(err);
                }

                // the *entire* stdout and stderr (buffered)
                // console.log(`stdout: ${stdout}`);
                // console.log(`stderr: ${stderr}`);

                this.version().then(version => resolve(version));
            });
        });
    }

    version() {
        return new Promise((resolve, reject) => {
            exec('git --no-pager show | head -1 | cut -d" " -f2', (err, stdout, stderr) => {
                resolve(stdout);
            });
        });
    }
}

module.exports = new GitUpdater();