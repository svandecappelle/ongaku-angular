const crypto = require('crypto');

const model = require('../model/password-resets');
const user = require('../model/user');
const sessionGuard = require('./session-guard');
const { MIN_PASSWORD } = require('./account-fields');

/** How long a reset link works, in hours */
const DURATIONS = [1, 24, 168];
const HOUR = 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const UNKNOWN = 'This reset link does not exist, was replaced or revoked';

const callback = (fn) => new Promise((resolve, reject) => fn((err, value) => (err ? reject(err) : resolve(value))));

/** What an administrator sees of a link */
function describe(reset) {
  return { token: reset.token, username: reset.username, created: reset.created, expires: reset.expires, createdBy: reset.createdBy };
}

/** A new link for an account (the former one stops working): { expiresInHours?: 1 | 24 | 168 } */
async function create(uid, username, createdBy, { expiresInHours } = {}) {
  const hours = expiresInHours === undefined || expiresInHours === null ? 24 : Number(expiresInHours);
  if (!DURATIONS.includes(hours)) {
    return { refused: `expiresInHours must be one of ${DURATIONS.join(', ')}` };
  }
  const now = Date.now();
  const reset = {
    token: crypto.randomBytes(16).toString('base64url'),
    uid: String(uid),
    username,
    createdBy,
    created: now,
    expires: now + hours * HOUR,
    usedAt: null,
  };
  await callback((done) => model.replace(reset, done));
  return { reset };
}

/** The link of a token while it can change a password, and its account; else why not */
async function usable(token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) {
    return { reason: UNKNOWN };
  }
  const reset = await callback((done) => model.get(token, done));
  if (!reset) {
    return { reason: UNKNOWN };
  }
  if (reset.usedAt) {
    return { reason: 'This reset link was used already' };
  }
  if (reset.expires <= Date.now()) {
    return { reason: 'This reset link has expired' };
  }
  // The account may have been deleted, or renamed, since
  const data = await callback((done) => user.getUserFields(reset.uid, ['username'], done));
  if (!data || data.username !== reset.username) {
    return { reason: UNKNOWN };
  }
  return { reset };
}

/**
 * Changes the password with a link, once: { password, confirmPassword }. The sessions of the
 * account end and its lock by failed logins goes. Resolves with { username } or { status, message }.
 */
async function use(token, { password, confirmPassword } = {}) {
  const { reset, reason } = await usable(token);
  if (!reset) {
    return { status: 404, message: reason };
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return { status: 400, message: `The password must have at least ${MIN_PASSWORD} characters` };
  }
  if (password !== confirmPassword) {
    return { status: 400, message: 'The password and its confirmation are different' };
  }
  if (!(await callback((done) => model.claim(reset.token, done)))) {
    return { status: 404, message: 'This reset link was used already' };
  }
  try {
    await callback((done) => user.setPassword(reset.uid, password, done));
    await callback((done) => user.markPasswordChanged(reset.uid, done));
  } catch (err) {
    await callback((done) => model.release(reset.token, done)).catch(() => undefined);
    throw err;
  }
  sessionGuard.forget(reset.uid);
  require('./attempts').forgetAccount(reset.username);
  await callback((done) => model.save({ ...reset, usedAt: Date.now() }, done));
  return { username: reset.username };
}

module.exports = { create, usable, use, describe, model, DURATIONS };
