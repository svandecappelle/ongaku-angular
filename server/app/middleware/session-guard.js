const user = require('../model/user');

/** A checked account is trusted this long (ms) before being read again */
const TRUST = 30 * 1000;

/**
 * Ends the sessions of the accounts disabled or deleted after their login, and the ones
 * opened before the last change of the password by a reset link or an administrator: a
 * session otherwise stays valid until it expires. The state of the accounts is cached
 * briefly; the administration forgets an account at once when it changes it.
 */
class SessionGuard {
  constructor() {
    /** uid -> { data: { username, banned, passwordChangedAt }, until } */
    this.accounts = new Map();
  }

  /**
   * Calls back with true while the account exists, is enabled, and its password did not change
   * after `signedInAt` (ms; the sessions opened before this check existed have none: kept)
   */
  check(uid, username, callback, signedInAt) {
    const judge = (data) => {
      if (!data) {
        return false;
      }
      // A session older than the last change of the password ends (the ones from before this
      // check have no time: opened at 0, they end with the next change)
      const changed = parseInt(data.passwordChangedAt, 10) || 0;
      const opened = Number(signedInAt) || 0;
      return data.username === username && parseInt(data.banned, 10) !== 1 && changed <= opened;
    };
    const known = this.accounts.get(uid);
    if (known && known.until > Date.now()) {
      return callback(judge(known.data));
    }
    user.getUserFields(uid, ['username', 'banned', 'passwordChangedAt'], (err, data) => {
      if (err) {
        // The database is down: the request fails elsewhere, the session is kept
        return callback(true);
      }
      this.accounts.set(uid, { data: data && data.username ? data : null, until: Date.now() + TRUST });
      callback(judge(data && data.username ? data : null));
    });
  }

  forget(uid) {
    this.accounts.delete(uid);
  }

  middleware() {
    return (req, res, next) => {
      const account = req.session && req.session.passport ? req.session.passport.user : null;
      if (!account || !account.uid) {
        return next();
      }
      this.check(account.uid, account.username, (valid) => {
        if (valid) {
          return next();
        }
        console.info(`Session of ${account.username} ended (account disabled, deleted, or its password changed)`);
        // An empty session: /api/auth then answers "not connected", which sends the page to the login
        req.session.regenerate(() => {
          if (req.path === '/auth' || req.path.startsWith('/auth/')) {
            return next();
          }
          res.status(401).json({ message: 'Your session has ended: sign in again' });
        });
      }, req.session.signedInAt);
    };
  }
}

module.exports = new SessionGuard();
