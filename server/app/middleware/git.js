const { execFile } = require('child_process');
const path = require('path');

/** The checkout of the application */
const REPOSITORY = path.resolve(__dirname, '../../../');

/** Runs git in the checkout, without a shell; resolves with its trimmed output */
function git(args, { timeout = 60 * 1000 } = {}) {
    return new Promise((resolve, reject) => {
        execFile('git', args, { cwd: REPOSITORY, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
            if (err) {
                err.message = `git ${args.join(' ')}: ${String(stderr || err.message).trim()}`;
                return reject(err);
            }
            resolve(String(stdout).trim());
        });
    });
}

/**
 * The code of the application, through the git command (the Docker image has no checkout:
 * there, version() gives null and update() fails; "make upgrade" updates the server).
 */
class GitUpdater {

    /** Brings the current branch up to date with its remote, fast-forward only; resolves with the new commit */
    async update() {
        // A branch that diverged from its remote is refused instead of merged
        await git(['pull', '--ff-only'], { timeout: 5 * 60 * 1000 });
        return this.version();
    }

    /** Commit of the checkout, null without a checkout or git */
    async version() {
        try {
            return await git(['rev-parse', 'HEAD'], { timeout: 10 * 1000 });
        } catch (err) {
            return null;
        }
    }
}

module.exports = new GitUpdater();
