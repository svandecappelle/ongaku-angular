const fs = require('fs');
const path = require('path');

/** Folders of the members: profile images, and their uploads in "imported" */
const USERS_DIRECTORY = path.resolve(__dirname, '../../../public/user');

/** The uploads folder of a member, made when missing */
function uploadsRoot(username) {
  const root = path.resolve(USERS_DIRECTORY, username, 'imported');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Absolute path of a path relative to the uploads folder, null when it leaves it */
function insideUploads(username, relative) {
  const root = uploadsRoot(username);
  const target = path.resolve(root, String(relative || '.'));
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

module.exports = { USERS_DIRECTORY, uploadsRoot, insideUploads };
