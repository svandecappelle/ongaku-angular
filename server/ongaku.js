/**
 * `npm start`: runs the server and starts it again whenever it exits, in the foreground.
 *
 * The administration's "Restart" button only ends the process (POST /api/admin/restart):
 * something must start it again. Here it is this script; in Docker it is the restart policy
 * of docker-compose.yml, which runs server/index.js directly.
 *
 * A server that keeps stopping right after its start (configuration error, database down)
 * is started again less and less often, up to every 30 seconds. Ctrl+C or SIGTERM stops both.
 */
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, 'index.js');
/** A server that ran this long is considered started: the delay goes back to the minimum */
const STABLE_AFTER = 10 * 1000;
const MIN_DELAY = 1000;
const MAX_DELAY = 30 * 1000;

let child = null;
let stopping = false;
let delay = MIN_DELAY;

function start() {
  const startedAt = Date.now();
  child = spawn(process.execPath, [SERVER, ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) {
      return;
    }
    delay = Date.now() - startedAt >= STABLE_AFTER ? MIN_DELAY : Math.min(delay * 2, MAX_DELAY);
    console.log(`[ongaku] The server stopped (${signal || `code ${code}`}): starting it again in ${delay / 1000} s`);
    setTimeout(start, delay);
  });
}

function stop(signal) {
  stopping = true;
  if (!child) {
    process.exit(0);
  }
  child.once('exit', () => process.exit(0));
  child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

start();
