const nconf = require('nconf');
const middleware = require('./middleware');
const user = require('../model/user');

/** Under /api, open to anonymous visitors: the authentication, the installation, the audio stream */
const PUBLIC_API = [/^\/auth(\/|$)/, /^\/install\/?$/, /^\/audio\/stream\//];

function desktop() {
  return nconf.get('type') === 'desktop';
}

/**
 * Access rules of the API. The desktop mode (a single local user) needs no login. The stream
 * keeps its own rules: the "Require authentication to stream" setting and the access keys.
 */
module.exports = {
  /** Every API route needs a login, except the public ones */
  api() {
    return (req, res, next) => {
      if (desktop() || middleware.isAuthenticated(req) || PUBLIC_API.some((route) => route.test(req.path))) {
        return next();
      }
      res.status(401).json({ message: 'You need to be logged' });
    };
  },

  requireAdministrator(req, res, next) {
    if (desktop()) {
      return next();
    }
    if (!middleware.isAuthenticated(req)) {
      return res.status(401).json({ message: 'You need to be logged' });
    }
    user.isAdministrator(req.session.passport.user.uid, (err, administrator) => {
      if (err || !administrator) {
        return res.status(403).json({ message: 'Administrator access required' });
      }
      next();
    });
  }
};
