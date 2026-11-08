const nconf = require('nconf');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** host[:port] of an address, null when it has none (unreadable, "null") */
function hostOf(address) {
  try {
    return new URL(address).host.toLowerCase();
  } catch (e) {
    return null;
  }
}

/**
 * Refuses the requests that change something when a browser says they come from another site
 * (Origin, else Referer): a page elsewhere cannot make the browser of a signed-in user act for
 * them (cross-site request forgery), whatever the type of its body. Requests without either
 * header come from programs, not from the pages of other sites, and pass. "allowedOrigins" of
 * application.yml lists other origins to accept (a front on another domain).
 */
function sameOrigin() {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }
    const from = req.get('origin') || req.get('referer');
    if (!from) {
      return next();
    }
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().toLowerCase();
    const allowed = [].concat(nconf.get('allowedOrigins') || []).map(hostOf).filter(Boolean);
    const origin = hostOf(from);
    if (origin && (origin === host || allowed.includes(origin))) {
      return next();
    }
    console.warn(`Refused ${req.method} ${req.originalUrl} from another site (${from})`);
    res.status(403).json({ message: 'Requests from other sites are refused' });
  };
}

module.exports = { sameOrigin, hostOf };
