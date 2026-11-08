const express = require('express');
const _ = require("underscore");
const fs = require('fs');
const path = require("path");
const async = require("async");
const moment = require('moment');
const nconf = require('nconf');
const getFolderSize = require('get-folder-size').default;
const getSize = (folder, callback) => getFolderSize.strict(folder).then((size) => callback(null, size), callback);

const library = require("./../../middleware/library");
const { formatOf } = require("./../../middleware/deduplicate");
const middleware = require("./../../middleware/middleware");
const importer = require("./../../middleware/importer");
const scanner = require("./../../middleware/scanner");
const libraryAudit = require("./../../middleware/library-audit");
const backup = require("./../../middleware/backup");
const sessionGuard = require("./../../middleware/session-guard");
const images = require("./../../middleware/images");
const statistics = require("./../../model/statistics");
const application = require("./../../index");
const user = require("./../../model/user");
const groups = require("./../../model/groups");
const meta = require("./../../meta");
const communication = require("./../../communication");
const db = require("./../../model/database");

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
            if (preferences && preferences.deduplicate !== undefined) {
                library.refreshDeduplication();
            }
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
            (next) => {
                if (changes.banned === undefined) {
                    return next();
                }
                user.setUserField(uid, 'banned', changes.banned ? 1 : 0, (err) => {
                    // A disabled account is signed out at once (sessions and sockets)
                    sessionGuard.forget(uid);
                    if (changes.banned) {
                        communication.disconnectUser(req.params.username);
                    }
                    next(err);
                });
            },
            (next) => {
                if (changes.uploadQuota === undefined) {
                    return next();
                }
                // null: back to the default quota
                if (changes.uploadQuota === null || changes.uploadQuota === '') {
                    return db.deleteObjectField('user:' + uid, 'uploadQuota', next);
                }
                const mb = parseFloat(changes.uploadQuota);
                if (!Number.isFinite(mb) || mb < 0) {
                    return next({ status: 400, message: 'The quota must be a positive number of MB, 0 for unlimited' });
                }
                user.setUserField(uid, 'uploadQuota', mb, next);
            },
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
        ], (err) => {
            if (err && err.status) {
                return res.status(err.status).json({ message: err.message });
            }
            err ? sendError(res, err) : res.json({ message: 'updated' });
        });
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
            // Signed out at once (sessions and sockets)
            sessionGuard.forget(uid);
            communication.disconnectUser(username);
            // Uploaded files, avatar and cover; the tracks leave the library on the next reload
            if (req.query.files === 'true') {
                fs.rmSync(path.join(USERS_DIRECTORY, path.basename(username)), { recursive: true, force: true });
            }
            res.json({ message: 'deleted' });
        });
    });
});

// ---------- Public library import ----------

const HEALTH_LIMIT = 500;
const UNKNOWN_ARTIST = 'Unknown artist';
// Spelling of the decoder (middleware/decoder.js)
const UNKNOWN_ALBUM = 'Uknown album';

/** Tags missing on a track: the decoder put a placeholder or the file name instead */
function missingTags(track) {
    const missing = [];
    const blank = (value) => value === undefined || value === null || String(value).trim() === '' || String(value) === 'undefined';
    if (blank(track.artist) || track.artist === UNKNOWN_ARTIST) {
        missing.push('artist');
    }
    if (blank(track.album) || track.album === UNKNOWN_ALBUM) {
        missing.push('album');
    }
    if (!track.metadatas || blank(track.metadatas.title)) {
        missing.push('title');
    }
    return missing;
}

/**
 * Problems of the public library, for the Health tab: albums without image, tracks with
 * missing tags, files that could not be read, and the count of duplicates.
 */
router.get('/library/health', (req, res) => {
    const tracks = library.flatten.filter((track) => !track.private);

    // Albums told apart by their artist; the cover is stored under the artist of a track
    const albums = new Map();
    tracks.forEach((track) => {
        if (!track.album || track.album === UNKNOWN_ALBUM) {
            return;
        }
        const artist = library.albumArtistOf(track);
        const key = library.albumKey(artist, track.album);
        if (!albums.has(key)) {
            albums.set(key, { artist: artist, coverArtist: track.artist, album: track.album, tracks: 0 });
        }
        albums.get(key).tracks++;
    });
    const withoutCover = Array.from(albums.values())
        .filter((album) => !library.hasAlbumCover(album.coverArtist, album.album))
        .sort((a, b) => String(a.artist).localeCompare(String(b.artist)) || String(a.album).localeCompare(String(b.album)));

    const untagged = tracks
        .map((track) => ({ track: track, missing: missingTags(track) }))
        .filter((entry) => entry.missing.length)
        .map((entry) => ({
            uid: entry.track.uid,
            title: entry.track.title,
            artist: entry.track.artist,
            album: entry.track.album,
            file: entry.track.file,
            missing: entry.missing,
            tags: _.pick(entry.track.metadatas || {}, 'artist', 'album', 'title', 'track', 'date', 'genre')
        }))
        .sort((a, b) => String(a.file).localeCompare(String(b.file)));

    const unreadable = Array.from(scanner.failures.values())
        .sort((a, b) => String(a.file).localeCompare(String(b.file)));

    const deduplication = library.getDeduplication();
    res.json({
        scanning: library.scanning(),
        counts: {
            withoutCover: withoutCover.length,
            missingTags: untagged.length,
            duplicates: deduplication.canonical.size,
            unreadable: unreadable.length
        },
        withoutCover: withoutCover.slice(0, HEALTH_LIMIT),
        missingTags: untagged.slice(0, HEALTH_LIMIT),
        unreadable: unreadable.slice(0, HEALTH_LIMIT)
    });
});

// ---------- Backup ----------

/** A backup or a restore runs: one at a time */
let backupBusy = null;

/** What a backup holds, with the sizes */
router.get('/backup/summary', (req, res, next) => {
    backup.summary().then((summary) => res.json(Object.assign({ busy: backupBusy }, summary))).catch(next);
});

/**
 * Downloads a backup as one .tar file: the database, the data folders (uploads, images, lyrics),
 * the configuration for reference and, with ?music=1, the music folders. Streamed as it is made.
 */
router.get('/backup', (req, res, next) => {
    if (backupBusy) {
        return res.status(409).json({ message: `A ${backupBusy} is already running` });
    }
    const music = req.query.music === '1' || req.query.music === 'true';
    const stamp = moment().format('YYYYMMDD-HHmm');
    backupBusy = 'backup';
    res.set({
        'Content-Type': 'application/x-tar',
        'Content-Disposition': `attachment; filename="ongaku-backup-${stamp}${music ? '-with-music' : ''}.tar"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    backup.create(res, { music: music }).catch((err) => {
        console.error('Backup failed', err);
        if (!res.headersSent) {
            return next(err);
        }
        res.destroy(err);
    }).finally(() => {
        backupBusy = null;
    });
});

/**
 * Restores a backup sent as the body (the .tar file itself). The database and the data folders are
 * replaced, the music is added to the music folders that can be written; then the library is
 * rescanned. The sessions stay, but an account missing from the backup is signed out.
 */
router.post('/backup/restore', (req, res) => {
    if (backupBusy) {
        return res.status(409).json({ message: `A ${backupBusy} is already running` });
    }
    backupBusy = 'restore';
    backup.restore(req).then(async (report) => {
        // The accounts, the settings and the library come from the backup now
        sessionGuard.accounts.clear();
        await Promise.all(['deduplicate', 'uploadQuota'].map((key) => new Promise((resolve) => meta.settings.getOne('global', key, (err, value) => {
            nconf.set(key, !err && value !== null && value !== undefined ? value : undefined);
            resolve();
        }))));
        library.refreshDeduplication();
        let rescan = 'started';
        if (library.scanProgress === true) {
            rescan = 'busy';
        } else {
            application.reload();
        }
        res.json(Object.assign({ message: 'restored', rescan: rescan }, report));
    }).catch((err) => {
        if (err instanceof backup.BackupError) {
            return res.status(400).json({ message: err.message });
        }
        console.error('Restore failed', err);
        res.status(500).json({ message: 'The backup could not be restored: see the server log' });
    }).finally(() => {
        backupBusy = null;
    });
});

/**
 * The files of the music folders against the library: the audio files that are listed, and why
 * the others are not (not scanned yet, format not enabled, unreadable, hidden duplicate), plus the
 * tracks whose file is gone. Lists are capped; the counts are complete.
 */
router.get('/library/audit', (req, res, next) => {
    libraryAudit.audit().then((report) => res.json(report)).catch(next);
});

/** Rescans the music folders in the background: { rescan: 'started' | 'busy' } */
router.post('/library/rescan', (req, res) => {
    if (library.scanProgress === true) {
        return res.json({ rescan: 'busy' });
    }
    application.reload();
    res.json({ rescan: 'started' });
});

/** Music available several times: the copy shown and the hidden ones (see middleware/deduplicate.js) */
router.get('/library/duplicates', (req, res) => {
    const describe = (track) => ({
        uid: track.uid,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        format: formatOf(track),
        file: track.file,
        user: track.private ? track.user : null
    });
    const deduplication = library.getDeduplication();
    const groups = deduplication.groups
        .map((group) => ({ kept: describe(group.kept), copies: group.copies.map(describe) }))
        .sort((a, b) => String(a.kept.artist).localeCompare(String(b.kept.artist)) || String(a.kept.album).localeCompare(String(b.kept.album))
            || String(a.kept.title).localeCompare(String(b.kept.title)));
    res.json({
        enabled: String(nconf.get('deduplicate')) !== 'false',
        hidden: deduplication.canonical.size,
        groups: groups.slice(0, 500),
        total: groups.length
    });
});

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

    importer.receive(req, destination).then((results) => {
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
});

// ---------- Artist and album images ----------

// Names come in the query: they may hold slashes
function imageTarget(req, res, callback) {
    const artist = typeof req.query.artist === 'string' ? req.query.artist : '';
    const album = typeof req.query.album === 'string' ? req.query.album : undefined;
    if (!artist) {
        return res.status(400).json({ message: 'artist is required' });
    }
    if (album === undefined ? !library.hasArtist(artist) : !library.hasAlbum(artist, album)) {
        return res.status(404).json({ message: album === undefined ? 'Unknown artist' : 'Unknown album' });
    }
    callback(artist, album, library.customImagePath(artist, album));
}

router.post('/images', (req, res) => {
    imageTarget(req, res, (artist, album, target) => {
        images.receiveImage(req, target).then((saved) => {
            if (!saved) {
                return res.status(400).json({ message: 'The file is not an image' });
            }
            if (album !== undefined) {
                library.applyCustomAlbumImage(artist, album);
            }
            res.json({ message: 'ok' });
        }, (err) => {
            console.error(err);
            res.status(500).json({ message: 'Internal server error' });
        });
    });
});

router.delete('/images', (req, res) => {
    imageTarget(req, res, (artist, album, target) => {
        fs.rm(target, { force: true }, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Internal server error' });
            }
            if (album !== undefined) {
                library.resetAlbumImage(artist, album);
            }
            res.json({ message: 'reset' });
        });
    });
});

module.exports = router;
