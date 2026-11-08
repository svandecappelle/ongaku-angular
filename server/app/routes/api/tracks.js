const express = require('express');
const fs = require('fs');
const path = require('path');
const async = require('async');
const library = require("./../../middleware/library");
const middleware = require("./../../middleware/middleware");
const user = require("./../../model/user");
const references = require("./../../model/database/redis/references");

const USERS_DIRECTORY = path.resolve(__dirname, '../../../../public/user');

var router = express.Router();

router.use((req, res, next) => {
    if (!middleware.isAuthenticated(req)) {
        return res.status(401).json({ message: 'You need to be logged' });
    }
    req.username = req.session.passport.user.username;
    user.isAdministrator(req.session.passport.user.uid, (err, administrator) => {
        req.administrator = !err && !!administrator;
        next();
    });
});

/** Administrators delete any track, the other users their own uploads */
function mayDelete(req, track) {
    return req.administrator || (track.private && track.user === req.username);
}

/** The shown track and its hidden copies (see middleware/deduplicate.js) the user may delete */
function filesOf(req, uid) {
    const shown = library.canonicalUid(uid);
    const copies = library.getDeduplication().groups.find((group) => group.kept.uid === shown);
    const tracks = [library.getByUid(shown)].concat(copies ? copies.copies : []).filter(Boolean);
    return tracks.filter((track) => mayDelete(req, track));
}

/** Removes the folders left empty in the uploads of a user, up to his uploads folder */
function removeEmptyFolders(file, username) {
    const root = path.join(USERS_DIRECTORY, username, 'imported');
    let folder = path.dirname(file);
    while (folder.startsWith(root + path.sep)) {
        try {
            fs.rmdirSync(folder);
        } catch (err) {
            // Not empty
            return;
        }
        folder = path.dirname(folder);
    }
}

/**
 * Deletes the files of tracks: { uids }. Answers with the uids deleted and the failures;
 * a track shown for several copies takes its copies along.
 */
router.post('/delete', (req, res) => {
    const uids = req.body && req.body.uids;
    if (!Array.isArray(uids) || !uids.length || !uids.every((uid) => typeof uid === 'string')) {
        return res.status(400).json({ message: 'uids must be a list of track uids' });
    }
    const deleted = [];
    const failed = [];
    async.eachSeries(uids, (uid, next) => {
        const track = library.getVisibleByUid(uid);
        if (!track) {
            failed.push({ uid: uid, message: 'No such track' });
            return next();
        }
        const tracks = filesOf(req, uid);
        if (!tracks.length) {
            failed.push({ uid: uid, title: track.title, message: 'You can only delete your own uploads' });
            return next();
        }
        async.eachSeries(tracks, (copy, done) => {
            fs.unlink(copy.file, (err) => {
                if (err && err.code !== 'ENOENT') {
                    console.error(`Cannot delete ${copy.file}`, err.message);
                    failed.push({
                        uid: copy.uid,
                        title: copy.title,
                        message: ['EROFS', 'EACCES', 'EPERM'].includes(err.code)
                            ? 'The file is read-only on the server (the music folder may be mounted read-only)'
                            : 'The file could not be deleted'
                    });
                    return done();
                }
                console.info(`Track deleted by ${req.username}: ${copy.file}`);
                library.removeTrack(copy.uid);
                if (copy.private && copy.user) {
                    removeEmptyFolders(copy.file, copy.user);
                }
                deleted.push(copy.uid);
                done();
            });
        }, next);
    }, () => {
        references.purgeTracks(deleted, (err) => {
            if (err) {
                console.error(err);
            }
            res.json({ deleted: deleted, failed: failed });
        });
    });
});

module.exports = router;
