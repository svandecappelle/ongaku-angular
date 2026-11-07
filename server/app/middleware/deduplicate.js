/**
 * Finds the tracks available several times in the library (same music in two folders,
 * imported twice, uploaded by a user while already public...) and keeps one copy of each.
 *
 * Two tracks are the same when artist, album, title, disc and track number match once
 * normalized (case, accents, punctuation), and their durations differ by at most
 * DURATION_TOLERANCE seconds. The kept copy is the public one first, then the best
 * format, then the one of the most complete album folder. A private upload is only merged into a public copy or into another upload
 * of the same user: the uploads of other users stay out of sight.
 */

const path = require('path');

const DURATION_TOLERANCE = 3;
/** Higher is better */
const ENCODING_RANK = { flac: 4, wav: 4, aiff: 4, alac: 4, m4a: 3, aac: 3, ogg: 3, opus: 3, mp3: 2 };

function normalize(value) {
    return String(value === undefined || value === null ? '' : value)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Number of "3", "3/12" or { no: 3 } */
function position(value) {
    if (value && typeof value === 'object') {
        value = value.no;
    }
    const number = parseInt(String(value === undefined || value === null ? '' : value).split('/')[0], 10);
    return Number.isFinite(number) ? number : '';
}

/** "m:ss" or "h:mm:ss" in seconds, null when unknown */
function seconds(track) {
    if (!track.duration) {
        return null;
    }
    const total = String(track.duration).split(':').reduce((sum, part) => sum * 60 + (parseInt(part, 10) || 0), 0);
    return total || null;
}

function keyOf(track) {
    const tags = track.metadatas || {};
    const title = normalize(track.title);
    if (!title) {
        // Nothing reliable to compare
        return null;
    }
    return [normalize(track.artist), normalize(track.album), title, position(tags.disk || tags.disc), position(tags.track)].join('|');
}

/** Format of the file ("encoding" is the streamed format: a flac file is streamed as mp3) */
function formatOf(track) {
    return path.extname(String(track.file || '')).slice(1).toLowerCase() || String(track.encoding || '').toLowerCase();
}

function rank(track) {
    return [track.private ? 0 : 1, ENCODING_RANK[formatOf(track)] || 1];
}

function albumKey(track) {
    return String(track.artist) + '\u0000' + String(track.album);
}

/** Comparator putting the better copy first; `albumSizes` counts the tracks of each album as tagged */
function comparator(albumSizes) {
    return (a, b) => {
        const ra = rank(a).concat(albumSizes.get(albumKey(a)) || 0);
        const rb = rank(b).concat(albumSizes.get(albumKey(b)) || 0);
        for (let i = 0; i < ra.length; i++) {
            if (ra[i] !== rb[i]) {
                return rb[i] - ra[i];
            }
        }
        // Stable choice between equivalent copies
        return String(a.file || a.uid).localeCompare(String(b.file || b.uid));
    };
}

function sameDuration(a, b) {
    const da = seconds(a);
    const db = seconds(b);
    return da === null || db === null || Math.abs(da - db) <= DURATION_TOLERANCE;
}

/**
 * @param {Array} tracks every track of the library
 * @returns {{visible: Array, canonical: Map, groups: Array}} the tracks to show (library order),
 *   the uid of the kept copy for each hidden uid, and the groups of copies ({kept, copies})
 */
function deduplicate(tracks) {
    // Candidates by key, then split into clusters of close durations
    const byKey = new Map();
    tracks.forEach((track) => {
        const key = keyOf(track);
        if (key === null) {
            return;
        }
        if (!byKey.has(key)) {
            byKey.set(key, []);
        }
        byKey.get(key).push(track);
    });

    // A copy tagged like the rest of its album wins over a stray one
    const albumSizes = new Map();
    tracks.forEach((track) => albumSizes.set(albumKey(track), (albumSizes.get(albumKey(track)) || 0) + 1));
    const compare = comparator(albumSizes);

    const canonical = new Map();
    const groups = [];
    byKey.forEach((candidates) => {
        if (candidates.length < 2) {
            return;
        }
        const clusters = [];
        candidates.slice().sort(compare).forEach((track) => {
            const cluster = clusters.find((c) => sameDuration(c[0], track) && (
                // The best copy of a cluster comes first: public, or an upload of this user
                !c[0].private || !track.private || c[0].user === track.user));
            if (cluster) {
                cluster.push(track);
            } else {
                clusters.push([track]);
            }
        });
        clusters.filter((cluster) => cluster.length > 1).forEach((cluster) => {
            const kept = cluster[0];
            const copies = cluster.slice(1);
            copies.forEach((copy) => canonical.set(copy.uid, kept.uid));
            groups.push({ kept: kept, copies: copies });
        });
    });

    return {
        visible: tracks.filter((track) => !canonical.has(track.uid)),
        canonical: canonical,
        groups: groups
    };
}

module.exports = { deduplicate, keyOf, formatOf };
