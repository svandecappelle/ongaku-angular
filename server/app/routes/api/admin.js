const express = require('express');
const _ = require("underscore");
const fs = require('fs');
const os = require('os');
const path = require("path");
const async = require("async");
const Busboy = require('busboy');
const moment = require('moment');
const nconf = require('nconf');
const getFolderSize = require('get-folder-size').default;
const getSize = (folder, callback) => getFolderSize.strict(folder).then((size) => callback(null, size), callback);

const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const importer = require("./../../middleware/importer");
const statistics = require("./../../model/statistics");
const application = require("./../../index");
const user = require("./../../model/user");
const groups = require("./../../model/groups");
const meta = require("./../../meta");

const MONTHS = 30;
const WEEKS = 7;
const APPLICATION_ID = "ongaku";
const USERS_DIRECTORY = path.resolve(__dirname, '../../../../public/user');
var router = express.Router();

// Folder of the public library where the administrators import files
// (docker-compose.yml mounts it writable inside the read only music folder)
function importFolder() {
    return nconf.get('importFolder') || path.join([].concat(nconf.get('library'))[0], 'Imported');
}

function folderSize(folder) {
    return fs.existsSync(folder) ? getFolderSize.strict(folder).catch(() => 0) : Promise.resolve(0);
}

function userStorages() {
    return new Promise((resolve, reject) => {
        user.getAllUsers((err, users) => {
            let folders = _.map(users.users, (userBean) => {
                return path.resolve(__dirname, `../../../../public/user/${userBean.username}/imported`);
            });
            folders = _.filter(folders, (folder) => {
                return fs.existsSync(folder);
            });
            if (folders.length > 0) {
                async.reduce(folders, 0, (currentSize, folder, next) => {
                    getSize(folder, (err, size) => {
                        if (err) { throw err; }
                        next(null, currentSize + size);
                    });
                }, function (error, ret) {
                    if (error) {
                        return reject(error);
                    }
                    resolve(ret);
                });
            } else {
                resolve(0);
            }
        });
    });
};

function redirectIfNotAdministrator(req, res, callback) {
    if (middleware.isAuthenticated(req)) {
        user.isAdministrator(req.session.passport.user.uid, (err, administrator) => {
            if (administrator) {
                callback();
            } else {
                res.status(403).json({
                    message: 'Administrator access required'
                });
            }
        });
    } else {
        if (nconf.get('type') === "desktop") {
            console.info("Desktop mode all access is granted.");
            callback();
        } else {
            console.warn("Anonymous access forbidden: authentication required.");
            res.status(401).json({
                message: 'Authentication required'
            });
        }
    }
};

// Every route of the administration requires an administrator
router.use((req, res, next) => redirectIfNotAdministrator(req, res, next));

getDayStatistics = (nbDays, statname) => {
    moment().startOf('day');
    var days = [];
    for (var i = nbDays; i >= 0; i--) {
        var day = moment().startOf('day').subtract(i, 'days');
        days.push({
            date: day,
            time: day.format('x'),
            value: 0
        });
    }

    return new Promise((resolve, reject) => {
        async.eachLimit(days, 2 * WEEKS, (day, next) => {
            statistics.getOne(statname, day.time, (err, value) => {
                if (value) {
                    day.value = value;
                }
                if (err) {
                    console.error(err);
                }
                next();
            });
        }, () => {
            resolve(days);
        });
    });
}

router.get('/statistics', (req, res) => {
    library.usage().then(size => {
        userStorages().then(sizeUsers => {
            let totalSpaceUsed = ((size + sizeUsers) / 1024 / 1024).toFixed(2);
            let commonSpaceUsed = (size / 1024 / 1024).toFixed(2)
            let usersSpaceUsed = ((sizeUsers) / 1024 / 1024).toFixed(2);

            user.count((err, usersCount) => {
                res.send({
                    usersCount: usersCount,
                    albumsCount: library.count('album'),
                    tracksCount: library.count(),
                    storage: {
                        total: {
                            value: totalSpaceUsed,
                            label: totalSpaceUsed + 'Mb'
                        },
                        common: {
                            value: commonSpaceUsed,
                            label: commonSpaceUsed + 'Mb'
                        },
                        users: {
                            value: usersSpaceUsed,
                            label: usersSpaceUsed + 'Mb'
                        }
                    }
                });
            });
        });
    });
});

router.get('/current', (req, res) => {
    console.debug("get current playlist");
    res.send({ all: _.compact(req.session.playlist), name: req.session.playlistname });
});

router.get('/statistics/users/access', (req, res) => {
    getDayStatistics(MONTHS, 'any').then((data) => {
        res.json(data);
    });
});

router.get('/statistics/users/login', (req, res) => {
    getDayStatistics(3 * MONTHS, 'logins').then((logins) => {
        getDayStatistics(3 * MONTHS, 'failed-logins').then((failedLogins) => {
            res.json({
                succeed: logins,
                failed: failedLogins
            })
        });
    });
});

router.get('/statistics/users/activity', (req, res) => {
    getDayStatistics(3 * MONTHS, 'plays').then((data) => {
        res.json(data);
    });
});

router.post('/library/reload', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        application.reload().then(() => {
            var libraryDatas = library.getAudio();
            res.json(libraryDatas);
        });
    });
});

router.get('/library/reload', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        application.reload().then(() => {
            var libraryDatas = library.getAudio();
            res.json(libraryDatas);
        });
    });
});

router.get('/configure', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        var properties = ["global"];
        console.info("Client access to admin index [" + req.ip + "]");
        meta.settings.get(properties, (err, settings) => {
            res.json(settings);
        });
    });
});

router.post('/configure', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        var preferences = req.body;
        async.forEachOf(preferences, (value, key, callback) => {
            meta.settings.setOne("global", key, value, (err) => {
                if (err) {
                    callback(err);
                }

                console.info("Global parameter saved: ", key, value);
                callback();
            });
        }, () => {
            res.json({
                message: 'done'
            });
        });
    });
});

router.post('/restart', (req, res) => {
    redirectIfNotAdministrator(req, res, () => {
        // TODO check if this can be optimized using forever scripts
        process.exit();
        /*forever.list(false, (err, processes) => {
            if (err) {
                console.error(err);
                res.status(500).send(err);
            } else if (processes) {
                console.log(processes);
                const ongaku = _.findWhere(processes, { uid: APPLICATION_ID });
                ongaku.index = _.indexOf(processes, ongaku);
                const pid = ongaku.pid;
                forever.restart(ongaku.index);
                res.send({ message: 'ok' });
            }
        });*/
    });
});
// ---------- Users ----------

function currentUid(req) {
    return req.session.passport && req.session.passport.user ? req.session.passport.user.uid : null;
}

function withUser(req, res, callback) {
    user.getUidByUsername(req.params.username, (err, uid) => {
        if (err || !uid) {
            return res.status(404).json({ message: 'Unknown user' });
        }
        callback(uid);
    });
}

function sendError(res, err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
}

router.get('/users', (req, res) => {
    user.listAll((err, users) => {
        if (err) {
            return sendError(res, err);
        }
        Promise.all(users.map((userData) => folderSize(path.join(USERS_DIRECTORY, userData.username, 'imported'))
            .then((size) => _.extend(userData, { storage: size, self: userData.uid === currentUid(req) }))))
            .then((users) => res.json(_.sortBy(users, (userData) => userData.username.toLowerCase())));
    });
});

router.post('/users', (req, res) => {
    const { username, email, password, administrator } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, e-mail and password are required' });
    }
    if (!/^[\w.-]+$/.test(username)) {
        return res.status(400).json({ message: 'The username may only contain letters, digits, dots, dashes and underscores' });
    }
    user.create({ username: username, email: email, password: password }, (err, uid) => {
        if (err === 'already exists username') {
            return res.status(409).json({ message: 'This username is already used' });
        }
        if (err === 'already exists email') {
            return res.status(409).json({ message: 'This e-mail is already used' });
        }
        if (err || !uid) {
            return sendError(res, err);
        }
        if (!administrator) {
            return res.json({ message: 'created' });
        }
        groups.join('administrators', uid, () => res.json({ message: 'created' }));
    });
});

router.put('/users/:username', (req, res) => {
    withUser(req, res, (uid) => {
        const changes = req.body;
        const self = uid === currentUid(req);
        if (self && (changes.administrator === false || changes.banned === true)) {
            return res.status(400).json({ message: 'You cannot remove your own administrator rights or disable your own account' });
        }
        async.series([
            (next) => changes.password ? user.setPassword(uid, changes.password, next) : next(),
            (next) => changes.banned !== undefined ? user.setUserField(uid, 'banned', changes.banned ? 1 : 0, next) : next(),
            (next) => {
                if (changes.administrator === undefined) {
                    return next();
                }
                // joinAs does not call back when the user is already a member
                user.isAdministrator(uid, (err, isAdmin) => {
                    if (err || !!isAdmin === !!changes.administrator) {
                        return next(err);
                    }
                    changes.administrator ? groups.join('administrators', uid, next) : groups.leave('administrators', uid, next);
                });
            }
        ], (err) => err ? sendError(res, err) : res.json({ message: 'updated' }));
    });
});

router.delete('/users/:username', (req, res) => {
    withUser(req, res, (uid) => {
        if (uid === currentUid(req)) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }
        user.remove(uid, (err, username) => {
            if (err) {
                return sendError(res, err);
            }
            // Uploaded files, avatar and cover; the tracks leave the library on the next reload
            if (req.query.files === 'true') {
                fs.rmSync(path.join(USERS_DIRECTORY, path.basename(username)), { recursive: true, force: true });
            }
            res.json({ message: 'deleted' });
        });
    });
});

// ---------- Public library import ----------

router.get('/library/import', (req, res) => {
    const folder = importFolder();
    // The import creates the folder: check the closest existing one
    let existing = folder;
    while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
        existing = path.dirname(existing);
    }
    fs.access(existing, fs.constants.W_OK, (err) => {
        res.json({ folder: folder, writable: !err, scanning: library.scanProgress === true });
    });
});

router.post('/library/import', (req, res) => {
    // Optional sub folder of the import folder, e.g. "Artist/Album" for single files
    const subFolder = path.normalize(String(req.query.folder || '.'));
    if (path.isAbsolute(subFolder) || subFolder.split(path.sep).includes('..')) {
        return res.status(400).json({ message: 'Invalid folder' });
    }
    const destination = path.join(importFolder(), subFolder);
    try {
        fs.mkdirSync(destination, { recursive: true });
        fs.accessSync(destination, fs.constants.W_OK);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: `The import folder ${importFolder()} is not writable` });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-import-'));
    const uploads = [];
    const busboy = Busboy({ headers: req.headers });
    busboy.on('file', (fieldname, file, { filename }) => {
        if (!importer.isSupported(filename)) {
            file.resume();
            uploads.push(Promise.resolve({ file: filename, error: 'Unsupported file type' }));
            return;
        }
        const tmpFile = path.join(tmpDir, `${uploads.length}`);
        uploads.push(new Promise((resolve, reject) => {
            file.pipe(fs.createWriteStream(tmpFile))
                .on('finish', resolve)
                .on('error', reject);
        }).then(() => importer.import(tmpFile, filename, destination))
            .then((imported) => ({ file: filename, imported: imported }))
            .catch((err) => {
                console.error(`Cannot import ${filename}`, err);
                return { file: filename, error: err.message };
            }));
    });
    busboy.on('close', async () => {
        const results = await Promise.all(uploads);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        // The full rescan can be long: it runs in the background. A scan already running
        // may have passed the folder: the administrator reloads the library afterwards.
        let rescan = 'none';
        if (results.some((result) => result.imported && result.imported.length)) {
            rescan = library.scanProgress === true ? 'busy' : 'started';
            if (rescan === 'started') {
                application.reload();
            }
        }
        res.json({ message: 'ok', files: results, rescan: rescan });
    });
    req.pipe(busboy);
});

module.exports = router;
