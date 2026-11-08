const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG = path.resolve(__dirname, '../../config/application.yml');
const EXAMPLE = path.resolve(__dirname, '../../config/application.example.yml');

/** Secrets everybody knows: the defaults of the templates and of the code */
const KNOWN = new Set(['change-me', 'changeme', 'keyboard cat', 'secret']);
/** SHA-256 of the secrets once published in git (their value stays out of the code) */
const PUBLISHED = new Set(['d22d0e8241037669dd1d8ac9f50853797559565f0c6bc2822bb9fb0e2dcbad4b']);
const MIN_LENGTH = 16;

const SECRET_LINE = /^secret:[ \t]*(.*?)[ \t]*$/m;

/** Whether a session secret cannot be trusted: missing, short, a default or published */
function weakSecret(value) {
  const secret = String(value || '').replace(/^['"]|['"]$/g, '');
  return secret.length < MIN_LENGTH
    || KNOWN.has(secret.toLowerCase())
    || PUBLISHED.has(crypto.createHash('sha256').update(secret).digest('hex'));
}

/**
 * Makes config/application.yml usable before the server reads it: created from the example when
 * missing, and given a random session secret when its own is weak. The secret signs the session
 * cookies: a known one lets anybody sign cookies of this server. Throws when the file cannot be
 * written (read-only volume): the server must not start with such a secret.
 */
function ensureConfig({ file = CONFIG, example = EXAMPLE, log = console } = {}) {
  if (!fs.existsSync(file)) {
    fs.copyFileSync(example, file);
    log.warn(`Created ${file} from ${path.basename(example)}: set the music folders ("library") there.`);
  }
  const text = fs.readFileSync(file, 'utf8');
  const match = SECRET_LINE.exec(text);
  if (match && !weakSecret(match[1])) {
    return false;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  const next = match ? text.replace(SECRET_LINE, `secret: ${secret}`) : `${text.replace(/\n?$/, '\n')}secret: ${secret}\n`;
  try {
    fs.writeFileSync(file, next, { mode: 0o600 });
  } catch (err) {
    throw new Error(`The session secret of ${file} is missing or publicly known, and the file cannot be written (${err.code || err.message}). `
      + 'Write a random value of at least 16 characters in its "secret" key, for example the output of "openssl rand -hex 32".');
  }
  log.warn(`A new random session secret was written in ${file}: the users have to sign in again.`);
  return true;
}

module.exports = { ensureConfig, weakSecret };
