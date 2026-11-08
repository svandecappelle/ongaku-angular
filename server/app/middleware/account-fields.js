const utils = require('./../utils');

/** Shortest password accepted when an account is created by its owner (sign up, installation) */
const MIN_PASSWORD = 8;

/**
 * Checks the fields of a new account: { username, email, password }.
 * Returns the message to show, or null when they are valid.
 */
function invalidAccountFields(fields) {
  const { username, email, password } = fields || {};
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !username || !email || !password) {
    return 'User name, e-mail and password are required';
  }
  if (!/^[\w.-]+$/.test(username)) {
    return 'The user name may only contain letters, digits, dots, dashes and underscores';
  }
  if (username.length > 40) {
    return 'The user name is too long (40 characters at most)';
  }
  if (!utils.isEmailValid(email)) {
    return 'This e-mail address is not valid';
  }
  if (password.length < MIN_PASSWORD) {
    return `The password must have at least ${MIN_PASSWORD} characters`;
  }
  return null;
}

module.exports = { invalidAccountFields, MIN_PASSWORD };
