const fs = require('fs');
const path = require('path');
const nconf = require('nconf');

const library = require('./library');
const scanner = require('./scanner');

/** Extensions of audio formats, enabled or not in the configuration (`audio` of application.yml) */
const AUDIO_EXTENSIONS = ['mp3', 'mp2', 'wav', 'wma', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'm4b', 'aac', 'alac', 'aif', 'aiff', 'ape', 'wv', 'mpc', 'mka', 'dsf', 'dff', 'ac3'];
/** Files listed in each category at most (the counts are complete) */
const LIMIT = 500;

function extensionOf(file) {
  return path.extname(file).slice(1);
}

/** A file under one of the music folders, relative to it; other files (uploads) as they are */
function shortPath(file, folders) {
  const folder = folders.find((item) => file.startsWith(item.endsWith(path.sep) ? item : item + path.sep));
  return folder ? path.relative(folder, file) : file;
}

/** Every file under a folder, symbolic links followed (as the scan does), without blocking the server */
async function walk(folder, files = [], seen = new Set()) {
  let real;
  try {
    real = await fs.promises.realpath(folder);
  } catch (err) {
    return files;
  }
  // A link back to a parent folder must not loop
  if (seen.has(real)) {
    return files;
  }
  seen.add(real);
  let entries;
  try {
    entries = await fs.promises.readdir(folder, { withFileTypes: true });
  } catch (err) {
    return files;
  }
  for (const entry of entries) {
    const file = path.join(folder, entry.name);
    let directory = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        directory = (await fs.promises.stat(file)).isDirectory();
      } catch (err) {
        continue;
      }
    }
    if (directory) {
      await walk(file, files, seen);
    } else {
      files.push(file);
    }
  }
  return files;
}

/**
 * Compares the music folders with the library: what each audio file became after the last scan,
 * and why the ones that are not listed are not.
 */
async function audit() {
  const folders = [].concat(nconf.get('library') || []).filter(Boolean).map(String);
  const enabled = new Set([].concat(nconf.get('audio') || []).map((ext) => String(ext).toLowerCase()));
  const tracks = new Map();
  library.tracks.forEach((track) => {
    if (track && track.file && track.type !== 'video') {
      tracks.set(track.file, track);
    }
  });
  const deduplication = library.getDeduplication();
  const byUid = new Map(library.tracks.map((track) => [track.uid, track]));

  const result = {
    scanning: library.scanning(),
    folders: [],
    counts: { audio: 0, listed: 0, duplicates: 0, unreadable: 0, notScanned: 0, disabledFormat: 0, missing: 0, other: 0 },
    notScanned: [],
    disabledFormat: [],
    unreadable: [],
    duplicates: [],
    missing: [],
    /** Other files (images, playlists, texts...), by extension */
    other: {}
  };
  const add = (list, item) => {
    if (result[list].length < LIMIT) {
      result[list].push(item);
    }
  };
  const onDisk = new Set();

  for (const folder of folders) {
    const exists = fs.existsSync(folder);
    const files = exists ? await walk(folder) : [];
    result.folders.push({ path: folder, exists: exists, files: files.length });
    for (const file of files) {
      onDisk.add(file);
      const relative = path.relative(folder, file);
      const extension = extensionOf(file);
      const lower = extension.toLowerCase();
      if (!AUDIO_EXTENSIONS.includes(lower)) {
        const key = lower || '(none)';
        result.other[key] = (result.other[key] || 0) + 1;
        result.counts.other++;
        continue;
      }
      result.counts.audio++;
      const track = tracks.get(file);
      if (track) {
        const kept = deduplication.canonical.get(track.uid);
        if (kept && kept !== track.uid) {
          result.counts.duplicates++;
          const shown = byUid.get(kept);
          add('duplicates', { file: relative, folder, title: track.title, artist: track.artist, album: track.album, keptFile: shown ? shortPath(shown.file, folders) : null });
        } else {
          result.counts.listed++;
        }
      } else if (!enabled.has(lower)) {
        result.counts.disabledFormat++;
        add('disabledFormat', { file: relative, folder, format: lower });
      } else if (scanner.failures.has(file)) {
        result.counts.unreadable++;
        add('unreadable', { file: relative, folder, error: scanner.failures.get(file).error });
      } else {
        result.counts.notScanned++;
        add('notScanned', {
          file: relative,
          folder,
          reason: extension !== lower ? 'uppercase-extension' : 'after-scan'
        });
      }
    }
  }

  // Tracks of the library whose file is gone (deleted or moved since the scan)
  tracks.forEach((track, file) => {
    const inFolders = folders.some((folder) => file.startsWith(folder.endsWith(path.sep) ? folder : folder + path.sep));
    if (inFolders && !onDisk.has(file)) {
      result.counts.missing++;
      add('missing', { file: shortPath(file, folders), title: track.title, artist: track.artist, album: track.album });
    }
  });

  const byFile = (a, b) => String(a.file).localeCompare(String(b.file));
  ['notScanned', 'disabledFormat', 'unreadable', 'duplicates', 'missing'].forEach((list) => result[list].sort(byFile));
  result.enabledFormats = [...enabled].sort();
  return result;
}

module.exports = { audit, AUDIO_EXTENSIONS };
