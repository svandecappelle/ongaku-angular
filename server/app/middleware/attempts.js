/**
 * Counts attempts by key over a sliding window, in memory: enough to slow down the guessing of
 * passwords on one server (a restart forgets them).
 */
class Attempts {
  /** At most `max` attempts in `windowMs` for each key */
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
    // Forgets the keys whose attempts are all past the window
    this.timer = setInterval(() => this.prune(), windowMs);
    this.timer.unref();
  }

  recent(key, now = Date.now()) {
    const hits = (this.hits.get(key) || []).filter((at) => now - at < this.windowMs);
    if (hits.length) {
      this.hits.set(key, hits);
    } else {
      this.hits.delete(key);
    }
    return hits;
  }

  /** Seconds to wait before the next attempt: 0 when allowed */
  wait(key, now = Date.now()) {
    const hits = this.recent(key, now);
    return hits.length < this.max ? 0 : Math.ceil((hits[hits.length - this.max] + this.windowMs - now) / 1000);
  }

  add(key, now = Date.now()) {
    this.hits.set(key, this.recent(key, now).concat(now));
  }

  clear(key) {
    this.hits.delete(key);
  }

  prune(now = Date.now()) {
    for (const key of this.hits.keys()) {
      this.recent(key, now);
    }
  }
}

const MINUTE = 60 * 1000;

/** Failed logins: per address and account, per address, and per account from anywhere */
const failedLogins = {
  pair: new Attempts({ windowMs: 15 * MINUTE, max: 5 }),
  address: new Attempts({ windowMs: 15 * MINUTE, max: 20 }),
  account: new Attempts({ windowMs: 15 * MINUTE, max: 50 }),
};
/** Accounts created per address (the refused attempts cost nothing: the server caps the accounts) */
const signUps = new Attempts({ windowMs: 60 * MINUTE, max: 5 });

function loginKeys(req) {
  const name = String((req.body && req.body.username) || '').trim().toLowerCase();
  return { pair: `${req.ip}|${name}`, address: req.ip, account: name };
}

function tooMany(res, seconds) {
  res.set('Retry-After', String(seconds));
  res.status(429).json({ message: `Too many attempts: try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}` });
}

/**
 * Before the login: refused while the address, or the address and the account, failed too often.
 * The answer counts: a failure is added, a success forgets the failures of the address and account.
 */
function limitLogins(req, res, next) {
  const keys = loginKeys(req);
  const wait = Math.max(...Object.keys(failedLogins).map((kind) => failedLogins[kind].wait(keys[kind])));
  if (wait > 0) {
    return tooMany(res, wait);
  }
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      Object.keys(failedLogins).forEach((kind) => keys[kind] && failedLogins[kind].add(keys[kind]));
    } else if (res.statusCode < 300) {
      failedLogins.pair.clear(keys.pair);
    }
  });
  next();
}

/** Before a sign up: a few accounts per address and per hour */
function limitSignUps(req, res, next) {
  const wait = signUps.wait(req.ip);
  if (wait > 0) {
    return tooMany(res, wait);
  }
  res.on('finish', () => res.statusCode < 300 && signUps.add(req.ip));
  next();
}

module.exports = { Attempts, limitLogins, limitSignUps, failedLogins, signUps };
