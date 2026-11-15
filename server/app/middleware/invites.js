const crypto = require('crypto');

const model = require('../model/invites');

/** Join links: how long they may work, in days (0: until used or revoked) */
const EXPIRIES = [0, 1, 7, 30];
const DAY = 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const MAX_NOTE = 100;
/** Unused links kept at once: past that, the administrators revoke some */
const MAX_OPEN = 100;

function expired(invite) {
  return !!invite.expires && invite.expires <= Date.now();
}

/** What an administrator sees of a link */
function describe(invite) {
  const { token, createdBy, note, created, expires, usedBy, usedAt } = invite;
  return {
    token, createdBy, note: note || '', created, expires: expires || null,
    usedBy: usedBy || null, usedAt: usedAt || null,
    state: usedBy ? 'used' : expired(invite) ? 'expired' : 'open',
  };
}

/**
 * The link of a token if an account can still be created with it; else null and why
 * (the same answer for an unknown token and a revoked link).
 */
function usable(token, callback) {
  if (typeof token !== 'string' || !TOKEN.test(token)) {
    return callback(null, null, 'This join link does not exist, or was revoked');
  }
  model.get(token, (err, invite) => {
    if (err) {
      return callback(err);
    }
    if (!invite) {
      return callback(null, null, 'This join link does not exist, or was revoked');
    }
    if (invite.usedBy) {
      return callback(null, null, 'This join link was used already');
    }
    if (expired(invite)) {
      return callback(null, null, 'This join link has expired');
    }
    callback(null, invite);
  });
}

/** A new link: { note?, expiresInDays? } -> the link, or an error message */
function create(createdBy, { note, expiresInDays }, callback) {
  const days = expiresInDays === undefined || expiresInDays === null ? 7 : Number(expiresInDays);
  if (!EXPIRIES.includes(days)) {
    return callback(null, null, `expiresInDays must be one of ${EXPIRIES.join(', ')} (0: until used)`);
  }
  model.list((err, invites) => {
    if (err) {
      return callback(err);
    }
    if (invites.filter((invite) => !invite.usedBy && !expired(invite)).length >= MAX_OPEN) {
      return callback(null, null, `${MAX_OPEN} links are waiting already: revoke some first`);
    }
    const now = Date.now();
    const invite = {
      token: crypto.randomBytes(16).toString('base64url'),
      createdBy,
      note: String(note || '').trim().slice(0, MAX_NOTE),
      created: now,
      expires: days ? now + days * DAY : null,
      usedBy: null,
      usedAt: null,
    };
    model.save(invite, (err) => callback(err, err ? null : invite));
  });
}

module.exports = { usable, create, describe, expired, model, TOKEN };
