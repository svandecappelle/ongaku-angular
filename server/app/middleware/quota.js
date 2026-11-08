const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const getFolderSize = require('get-folder-size').default;

const user = require('../model/user');

const MB = 1024 * 1024;
const USERS_DIRECTORY = path.resolve(__dirname, '../../../public/user');

/**
 * Upload quotas. The default quota is the `uploadQuota` setting, in MB (0 or empty: unlimited).
 * A user may have his own `uploadQuota` field: empty for the default, 0 for unlimited, or MB.
 * Administrators have no quota.
 */
class Quota {
  /** MB setting to bytes, null when unlimited */
  toBytes(value) {
    const mb = parseFloat(value);
    return Number.isFinite(mb) && mb > 0 ? Math.round(mb * MB) : null;
  }

  defaultQuota() {
    return this.toBytes(nconf.get('uploadQuota'));
  }

  /** Bytes used by the uploads of a user */
  usage(username) {
    const folder = path.join(USERS_DIRECTORY, username, 'imported');
    if (!fs.existsSync(folder)) {
      return Promise.resolve(0);
    }
    return getFolderSize.strict(folder).catch(() => 0);
  }

  /** Quota of a user in bytes, null when unlimited; `own` is his own setting (null: the default) */
  limit(uid, callback) {
    user.isAdministrator(uid, (err, administrator) => {
      if (err) {
        return callback(err);
      }
      user.getUserField(uid, 'uploadQuota', (err, own) => {
        if (err) {
          return callback(err);
        }
        const hasOwn = own !== null && own !== undefined && own !== '';
        callback(null, {
          administrator: !!administrator,
          own: hasOwn ? parseFloat(own) || 0 : null,
          quota: administrator ? null : (hasOwn ? this.toBytes(own) : this.defaultQuota())
        });
      });
    });
  }

  /** { used, quota, remaining } in bytes; quota and remaining are null when unlimited */
  status(uid, username, callback) {
    this.limit(uid, (err, limit) => {
      if (err) {
        return callback(err);
      }
      this.usage(username).then((used) => callback(null, {
        used: used,
        quota: limit.quota,
        own: limit.own,
        administrator: limit.administrator,
        remaining: limit.quota === null ? null : Math.max(0, limit.quota - used)
      }));
    });
  }

  /**
   * Calls back with the bytes the connected user may still upload (null: unlimited). A request
   * larger than that is refused before being read (413); the files are also checked while received.
   */
  check(req, res, username, callback) {
    this.status(req.session.passport.user.uid, username, (err, status) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      const size = parseInt(req.headers['content-length'], 10) || 0;
      // Room for the multipart envelope
      if (status.remaining !== null && (status.remaining === 0 || size > status.remaining + 64 * 1024)) {
        req.resume();
        return res.status(413).json({ message: 'Upload quota exceeded', used: status.used, quota: status.quota, remaining: status.remaining });
      }
      callback(status.remaining);
    });
  }
}

module.exports = new Quota();
