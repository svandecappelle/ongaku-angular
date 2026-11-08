const user = require('../model/user');

/** A checked account is trusted this long (ms) before being read again */
const TRUST = 30 * 1000;

/**
 * Ends the sessions of the accounts disabled or deleted after their login: a session
 * otherwise stays valid until it expires. The state of the accounts is cached briefly;
 * the administration forgets an account at once when it disables or deletes it.
 */
class SessionGuard {
  constructor() {
    /** uid -> { valid, until } */
    this.accounts = new Map();
  }

  /** Calls back with true while the account exists and is enabled */
  check(uid, username, callback) {
    const known = this.accounts.get(uid);
    if (known && known.until > Date.now()) {
      return callback(known.valid);
    }
    user.getUserFields(uid, ['username', 'banned'], (err, data) => {
      if (err) {
        // The database is down: the request fails elsewhere, the session is kept
        return callback(true);
      }
      const valid = !!data && data.username === username && parseInt(data.banned, 10) !== 1;
      this.accounts.set(uid, { valid: valid, until: Date.now() + TRUST });
      callback(valid);
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
        console.info(`Session of the disabled or deleted account ${account.username} ended`);
        // An empty session: /api/auth then answers "not connected", which sends the page to the login
        req.session.regenerate(() => {
          if (req.path === '/auth' || req.path.startsWith('/auth/')) {
            return next();
          }
          res.status(401).json({ message: 'Your account is disabled or no longer exists' });
        });
      });
    };
  }
}

module.exports = new SessionGuard();
