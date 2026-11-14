const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const logger = require('log4js').getLogger('LibraryWatcher');

const communication = require('../communication');
const library = require('./library');
const scanner = require('./scanner');
const video = require('./video');
const Decoder = require('./decoder').class;

/** Changes gathered before they are applied: a copied album is one update */
const BATCH_DELAY = 1500;
/** A file is read once its size stays the same this long (a copy in progress) */
const STABLE_FOR = 2000;
/** While a full scan runs, the changes wait (it may have passed their folder already) */
const SCAN_RETRY = 2000;
/** Albums named in the notification */
const NAMED_ALBUMS = 3;
const COVER = 'cover.jpg';

function extensionOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

function listed(type, file) {
  return [].concat(nconf.get(type) || []).map((ext) => String(ext).toLowerCase()).includes(extensionOf(file));
}

/**
 * Keeps the library up to date with its folders: files added, changed, moved or deleted
 * are read again alone, without a full scan, and the pages are told ("library:changed").
 *
 * Setting "watchLibrary" (application.yml): true (default), "poll" for the folders where the
 * system tells no changes (network shares), false to only rescan by hand.
 */
class LibraryWatcher {

  constructor() {
    this.watchers = [];
    /** file -> 'change' | 'unlink' | 'unlinkDir', the last event of each path wins */
    this.pending = new Map();
    this.timer = null;
    this.running = false;
    this.audio = new Decoder('audio');
  }

  mode() {
    const value = nconf.get('watchLibrary');
    if (value === false || value === 'false') {
      return 'off';
    }
    return value === 'poll' ? 'poll' : 'events';
  }

  async start() {
    const mode = this.mode();
    if (mode === 'off') {
      logger.info('Watching of the music folders turned off (watchLibrary: false)');
      return;
    }
    const { watch } = require('chokidar');
    const folders = [].concat(nconf.get('library') || []).filter(Boolean).map((folder) => path.resolve(String(folder)));
    for (const folder of folders) {
      if (!fs.existsSync(folder)) {
        logger.warn(`Music folder not watched, it does not exist: ${folder}`);
        continue;
      }
      const watcher = watch(folder, {
        ignoreInitial: true,
        persistent: true,
        usePolling: mode === 'poll',
        interval: 5000,
        binaryInterval: 5000,
        // Hidden files and folders (.torrents, .cache, .DS_Store...)
        ignored: (file) => path.basename(file).startsWith('.') && file !== folder,
        awaitWriteFinish: { stabilityThreshold: STABLE_FOR, pollInterval: 250 },
      });
      watcher.on('add', (file) => this.queue(file, 'change'));
      watcher.on('change', (file) => this.queue(file, 'change'));
      watcher.on('unlink', (file) => this.queue(file, 'unlink'));
      watcher.on('unlinkDir', (dir) => this.queue(dir, 'unlinkDir'));
      watcher.on('error', (err) => {
        // Linux: too many folders for the inotify limit
        const hint = err && err.code === 'ENOSPC'
          ? ' (raise fs.inotify.max_user_watches, or set watchLibrary: poll)'
          : '';
        logger.error(`Watching ${folder} failed: ${err && err.message}${hint}`);
      });
      await new Promise((resolve) => watcher.once('ready', resolve));
      this.watchers.push({ folder, watcher });
      logger.info(`Watching the music folder ${folder}${mode === 'poll' ? ' (polling)' : ''}`);
    }
  }

  /** For the Files tab: how the folders are watched, and which ones */
  status() {
    return { mode: this.mode(), folders: this.watchers.map(({ folder }) => folder) };
  }

  /** A music folder is watched */
  watches(folder) {
    const resolved = path.resolve(String(folder));
    return this.watchers.some((entry) => entry.folder === resolved);
  }

  async stop() {
    clearTimeout(this.timer);
    await Promise.all(this.watchers.map(({ watcher }) => watcher.close()));
    this.watchers = [];
  }

  queue(file, kind) {
    this.pending.set(file, kind);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), BATCH_DELAY);
  }

  /** The music folder holding a path, if it is still there (an unmounted disk empties nothing) */
  rootOf(file) {
    const entry = this.watchers.find(({ folder }) => file === folder || file.startsWith(folder + path.sep));
    return entry ? entry.folder : null;
  }

  async flush() {
    this.timer = null;
    // A batch being applied, or a full scan running: these changes wait
    if (this.running) {
      this.timer = setTimeout(() => this.flush(), BATCH_DELAY);
      return;
    }
    if (library.scanning()) {
      this.timer = setTimeout(() => this.flush(), SCAN_RETRY);
      return;
    }
    const batch = [...this.pending];
    this.pending.clear();
    if (!batch.length) {
      return;
    }
    this.running = true;
    const summary = { added: 0, updated: 0, removed: 0, videos: 0, covers: 0, unreadable: 0, albums: new Map() };
    try {
      for (const [file, kind] of batch) {
        await this.apply(file, kind, summary);
      }
    } catch (err) {
      logger.error('Library update failed', err);
    } finally {
      this.running = false;
    }
    this.announce(summary);
    // Changes that came while applying these
    if (this.pending.size && !this.timer) {
      this.timer = setTimeout(() => this.flush(), BATCH_DELAY);
    }
  }

  async apply(file, kind, summary) {
    const root = this.rootOf(file);
    if (kind !== 'change') {
      if (!root || !fs.existsSync(root)) {
        logger.warn(`Ignoring the removal of ${file}: its music folder is not reachable`);
        return;
      }
      const { tracks, videos } = library.removeUnder(file);
      tracks.forEach((track) => this.noteAlbum(summary, track));
      summary.removed += tracks.length;
      summary.videos += videos.length;
      scanner.failures.delete(file);
      if (kind === 'unlink' && path.basename(file).toLowerCase() === COVER) {
        summary.covers += library.refreshFolderCover(path.dirname(file));
      }
      return;
    }
    if (!fs.existsSync(file)) {
      return;
    }
    if (path.basename(file).toLowerCase() === COVER) {
      summary.covers += library.refreshFolderCover(path.dirname(file));
      return;
    }
    if (listed('audio', file)) {
      try {
        const song = await this.audio.decode(file);
        scanner.failures.delete(file);
        const result = library.upsertTrack(song);
        summary[result]++;
        this.noteAlbum(summary, song);
      } catch (err) {
        // Kept for the audit of the library, as the full scan does
        scanner.failures.set(file, { file, error: scanner.constructor.reason(err) });
        summary.unreadable++;
        logger.warn(`Cannot read ${file}: ${err && (err.message || err.cause) || err}`);
      }
    } else if (listed('video', file)) {
      try {
        library.upsertVideo(await video.describe(file));
        summary.videos++;
      } catch (err) {
        summary.unreadable++;
        logger.warn(`Cannot read the video ${file}: ${err && err.message}`);
      }
    }
  }

  noteAlbum(summary, track) {
    if (track && track.album && summary.albums.size < NAMED_ALBUMS) {
      summary.albums.set(`${track.artist}\u0000${track.album}`, { artist: track.artist, album: track.album });
    }
  }

  announce(summary) {
    const { added, updated, removed, videos, covers, unreadable } = summary;
    if (!added && !updated && !removed && !videos && !covers && !unreadable) {
      return;
    }
    const albums = [...summary.albums.values()];
    logger.info(`Library updated: ${added} added, ${updated} updated, ${removed} removed, ${videos} video changes, ${covers} covers, ${unreadable} unreadable`);
    communication.broadcast('library:changed', { added, updated, removed, videos, covers, unreadable, albums, at: Date.now() });
  }
}

module.exports = new LibraryWatcher();
