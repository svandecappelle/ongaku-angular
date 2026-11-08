const fs = require('fs');
const os = require('os');
const path = require('path');
const nconf = require('nconf');
const tar = require('tar');
const getFolderSize = require('get-folder-size').default;

const db = require('../model/database');

const FORMAT = 'ongaku-backup';
const VERSION = 1;
const PUBLIC = path.resolve(__dirname, '../../../public');
const CONFIG = path.resolve(__dirname, '../../config/application.yml');
/** Folders of public/ that hold data: uploads and profile images, artist and album images, lyrics */
const DATA_FOLDERS = ['user', 'artists-covers', 'lyrics'];
/** The sessions stay out: they are tied to this server and hold nothing to keep */
const SESSION_PREFIX = 'ongaku:sess:';
const SCAN_COUNT = 500;

class BackupError extends Error {}

function command(name, ...args) {
  return new Promise((resolve, reject) => db.client[name](...args, (err, reply) => (err ? reject(err) : resolve(reply))));
}

function libraryFolders() {
  return [].concat(nconf.get('library') || []).filter(Boolean).map(String);
}

/** Every key of the database but the sessions, by batches */
async function eachKey(onKeys) {
  let cursor = '0';
  do {
    const [next, keys] = await command('scan', cursor, 'MATCH', '*', 'COUNT', SCAN_COUNT);
    cursor = String(next);
    const kept = keys.filter((key) => !key.startsWith(SESSION_PREFIX));
    if (kept.length) {
      await onKeys(kept);
    }
  } while (cursor !== '0');
}

/** A key as a line of JSON: { key, type, ttl (ms, -1 without expiry), value } */
async function exportKey(key) {
  const type = await command('type', key);
  let value;
  if (type === 'string') {
    value = await command('get', key);
  } else if (type === 'hash') {
    value = await command('hgetall', key);
  } else if (type === 'set') {
    value = await command('smembers', key);
  } else if (type === 'zset') {
    const flat = await command('zrange', key, '0', '-1', 'WITHSCORES');
    value = [];
    for (let i = 0; i < flat.length; i += 2) {
      value.push([flat[i], Number(flat[i + 1])]);
    }
  } else if (type === 'list') {
    value = await command('lrange', key, '0', '-1');
  } else {
    // Gone meanwhile, or a type Ongaku does not use
    return null;
  }
  const ttl = Number(await command('pttl', key));
  return JSON.stringify({ key, type, ttl: ttl > 0 ? ttl : -1, value });
}

async function exportDatabase(file) {
  const out = fs.createWriteStream(file);
  let keys = 0;
  await eachKey(async (batch) => {
    for (const key of batch) {
      const line = await exportKey(key);
      if (line && !out.write(line + '\n')) {
        await new Promise((resolve) => out.once('drain', resolve));
      }
      keys += line ? 1 : 0;
    }
  });
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  return keys;
}

const folderSize = (folder) => getFolderSize.loose(folder).catch(() => 0);

function writable(folder) {
  try {
    fs.accessSync(folder, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

/** What a backup holds, with the sizes: shown before downloading */
async function summary() {
  let keys = 0;
  await eachKey(async (batch) => {
    keys += batch.length;
  });
  const data = await Promise.all(DATA_FOLDERS.map(async (name) => ({ name, size: await folderSize(path.join(PUBLIC, name)) })));
  const music = await Promise.all(libraryFolders().map(async (folder, index) => ({
    index,
    path: folder,
    exists: fs.existsSync(folder),
    writable: writable(folder),
    size: await folderSize(folder),
  })));
  return { database: { keys }, data, music };
}

/** Name of a library folder in the archive: music/<index>-<last part of its path> */
function musicEntryName(folder, index) {
  return `${index}-${path.basename(path.resolve(folder)).replace(/[^\w.-]+/g, '_') || 'music'}`;
}

/** The parts a backup can hold: "data" (database, data folders, configuration) and "music" */
const PARTS = ['data', 'music'];

/**
 * Writes a backup into `output` as a tar stream: manifest.json first, then, for the "data" part,
 * the database, the configuration (for reference: it is not restored) and the data folders, and
 * for the "music" part the library folders. The two parts may go in one file or in two. The
 * files are read from a folder of links, so nothing is copied first.
 */
async function create(output, { parts }) {
  const wanted = new Set((parts || ['data']).filter((part) => PARTS.includes(part)));
  if (!wanted.size) {
    throw new BackupError('Nothing to back up');
  }
  const stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ongaku-backup-'));
  try {
    const entries = ['manifest.json'];
    let keys = 0;
    let data = [];
    if (wanted.has('data')) {
      keys = await exportDatabase(path.join(stage, 'database.jsonl'));
      entries.push('database.jsonl');
      if (fs.existsSync(CONFIG)) {
        await fs.promises.mkdir(path.join(stage, 'config'));
        await fs.promises.symlink(CONFIG, path.join(stage, 'config/application.yml'));
        entries.push('config');
      }
      await fs.promises.mkdir(path.join(stage, 'data'));
      data = DATA_FOLDERS.filter((name) => fs.existsSync(path.join(PUBLIC, name)));
      for (const name of data) {
        await fs.promises.symlink(path.join(PUBLIC, name), path.join(stage, 'data', name));
      }
      entries.push('data');
    }
    const folders = wanted.has('music') ? libraryFolders().map((folder, index) => ({ index, path: folder, name: musicEntryName(folder, index) })).filter((folder) => fs.existsSync(folder.path)) : [];
    if (folders.length) {
      await fs.promises.mkdir(path.join(stage, 'music'));
      for (const folder of folders) {
        await fs.promises.symlink(path.resolve(folder.path), path.join(stage, 'music', folder.name));
      }
      entries.push('music');
    }
    const manifest = {
      format: FORMAT,
      version: VERSION,
      createdAt: new Date().toISOString(),
      application: require(path.resolve(__dirname, '../../../package.json')).version,
      parts: PARTS.filter((part) => wanted.has(part)),
      database: wanted.has('data') ? { keys } : null,
      data,
      music: folders.map(({ index, name, path: folderPath }) => ({ index, name, path: folderPath })),
    };
    await fs.promises.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));

    await new Promise((resolve, reject) => {
      // follow: the links of the stage folder (and of the music, as the scan does) are archived as their targets
      const pack = tar.c({ cwd: stage, follow: true, portable: true, onwarn: (code, message) => console.warn(`Backup: ${message}`) }, entries);
      pack.on('error', reject);
      // The download stopped (the browser cancelled it): nothing more is read
      output.on('close', () => {
        if (typeof pack.destroy === 'function') {
          pack.destroy();
        }
        resolve();
      });
      output.on('error', reject);
      pack.on('end', resolve);
      pack.pipe(output);
    });
  } finally {
    fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}

/** A path of the archive split in safe parts, or null (absolute, "..", empty) */
function safeParts(entryPath) {
  const parts = String(entryPath).replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (!parts.length || String(entryPath).startsWith('/') || parts.some((part) => part === '..')) {
    return null;
  }
  return parts;
}

/** Writes the lines of a database export: every key but the sessions is replaced */
async function importDatabase(file) {
  const lines = (await fs.promises.readFile(file, 'utf8')).split('\n').filter(Boolean);
  const records = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new BackupError(`The database of the backup is damaged (line ${index + 1})`);
    }
  });
  // Everything goes, but the sessions: they keep the administrator signed in
  await eachKey(async (batch) => {
    await command('del', ...batch);
  });
  for (let i = 0; i < records.length; i += SCAN_COUNT) {
    const multi = db.client.multi();
    for (const record of records.slice(i, i + SCAN_COUNT)) {
      const { key, type, value, ttl } = record;
      if (typeof key !== 'string' || key.startsWith(SESSION_PREFIX)) {
        continue;
      }
      if (type === 'string') {
        multi.set(key, String(value));
      } else if (type === 'hash' && value && Object.keys(value).length) {
        multi.hset(key, value);
      } else if (type === 'set' && Array.isArray(value) && value.length) {
        multi.sadd(key, value);
      } else if (type === 'zset' && Array.isArray(value) && value.length) {
        multi.zadd(key, value.flatMap(([member, score]) => [String(score), String(member)]));
      } else if (type === 'list' && Array.isArray(value) && value.length) {
        multi.rpush(key, value);
      } else {
        continue;
      }
      if (ttl > 0) {
        multi.pexpire(key, String(ttl));
      }
    }
    await new Promise((resolve, reject) => multi.exec((err) => (err ? reject(err) : resolve())));
  }
  return records.length;
}

/**
 * Restores a backup read from `input` (a tar stream). manifest.json must come first. The data
 * folders are extracted aside, then swapped with the current ones once the whole archive is read,
 * with the database; the music is added to the library folders (nothing is deleted there; a folder
 * the server cannot write, as a read-only volume, is skipped). The configuration is not restored.
 * Resolves with what was restored.
 */
async function restore(input) {
  const stage = await fs.promises.mkdtemp(path.join(PUBLIC, '.restore-'));
  const folders = libraryFolders();
  const report = { parts: [], database: 0, data: [], music: { files: 0, skipped: 0, folders: [] }, ignored: 0 };
  const writes = [];
  let manifest = null;
  let first = true;
  let failure = null;
  const musicTargets = new Map();

  const fail = (message) => {
    if (!failure) {
      failure = new BackupError(message);
    }
  };

  /** Where an entry of the archive goes, null to skip it */
  const destination = (parts) => {
    if (parts[0] === 'database.jsonl' && parts.length === 1) {
      return path.join(stage, 'database.jsonl');
    }
    if (parts[0] === 'data' && parts.length >= 2 && DATA_FOLDERS.includes(parts[1])) {
      if (!report.data.includes(parts[1])) {
        report.data.push(parts[1]);
      }
      return path.join(stage, 'data', ...parts.slice(1));
    }
    if (parts[0] === 'music' && parts.length >= 3) {
      const described = (manifest.music || []).find((folder) => folder.name === parts[1]);
      const index = described ? described.index : parseInt(parts[1], 10);
      const target = folders[index];
      if (!target) {
        report.music.skipped++;
        return null;
      }
      if (!musicTargets.has(index)) {
        musicTargets.set(index, writable(target));
        report.music.folders.push({ index, path: target, writable: musicTargets.get(index) });
      }
      if (!musicTargets.get(index)) {
        report.music.skipped++;
        return null;
      }
      report.music.files++;
      return path.join(target, ...parts.slice(2));
    }
    // The configuration and anything else stay out
    report.ignored++;
    return null;
  };

  const parser = new tar.Parser({
    strict: true,
    onReadEntry: (entry) => {
      // Decided at once: the entry flows as soon as this returns
      const parts = safeParts(entry.path);
      if (first) {
        first = false;
        if (!parts || parts.join('/') !== 'manifest.json') {
          fail('This file is not an Ongaku backup (no manifest first)');
          return entry.resume();
        }
        const chunks = [];
        entry.on('data', (chunk) => chunks.push(chunk));
        entry.on('end', () => {
          try {
            manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch (err) {
            manifest = null;
          }
          if (!manifest || manifest.format !== FORMAT || manifest.version > VERSION) {
            fail(manifest && manifest.format === FORMAT ? 'This backup comes from a newer version of Ongaku' : 'This file is not an Ongaku backup');
          }
        });
        return undefined;
      }
      if (failure || !manifest || !parts || !['File', 'OldFile', 'Directory'].includes(entry.type)) {
        if (parts && !['File', 'OldFile', 'Directory'].includes(entry.type)) {
          report.ignored++;
        }
        return entry.resume();
      }
      const target = destination(parts);
      if (!target) {
        return entry.resume();
      }
      try {
        if (entry.type === 'Directory') {
          fs.mkdirSync(target, { recursive: true });
          return entry.resume();
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const out = fs.createWriteStream(target);
        writes.push(new Promise((resolve) => {
          out.on('finish', resolve);
          out.on('error', (err) => {
            console.warn(`Restore: ${target}: ${err.message}`);
            report.music.skipped++;
            entry.resume();
            resolve();
          });
        }));
        entry.pipe(out);
      } catch (err) {
        console.warn(`Restore: ${target}: ${err.message}`);
        report.music.skipped++;
        entry.resume();
      }
      return undefined;
    },
  });

  try {
    await new Promise((resolve, reject) => {
      parser.on('error', (err) => reject(new BackupError(`The backup is damaged: ${err.message}`)));
      parser.on('end', resolve);
      parser.on('close', resolve);
      input.on('error', reject);
      input.pipe(parser);
    });
    await Promise.all(writes);
    if (failure) {
      throw failure;
    }
    if (!manifest) {
      throw new BackupError('This file is not an Ongaku backup');
    }
    // Backups made before the parts existed held the data, and the music when asked
    const parts = Array.isArray(manifest.parts) ? manifest.parts : ['data'].concat((manifest.music || []).length ? ['music'] : []);
    report.parts = parts;
    const hasDatabase = fs.existsSync(path.join(stage, 'database.jsonl'));
    if (parts.includes('data') && !hasDatabase) {
      throw new BackupError('The backup holds no database');
    }
    if (!hasDatabase) {
      // The music part alone: nothing else changes
      report.manifest = { createdAt: manifest.createdAt, application: manifest.application };
      return report;
    }

    // The whole archive is read: the database and the data folders are replaced
    report.database = await importDatabase(path.join(stage, 'database.jsonl'));
    for (const name of report.data) {
      const current = path.join(PUBLIC, name);
      const restored = path.join(stage, 'data', name);
      // A mounted volume cannot be renamed: its content is replaced instead
      await fs.promises.mkdir(current, { recursive: true });
      for (const child of await fs.promises.readdir(current)) {
        await fs.promises.rm(path.join(current, child), { recursive: true, force: true });
      }
      for (const child of await fs.promises.readdir(restored)) {
        await fs.promises.rename(path.join(restored, child), path.join(current, child)).catch(async () => {
          await fs.promises.cp(path.join(restored, child), path.join(current, child), { recursive: true });
        });
      }
    }
    report.manifest = { createdAt: manifest.createdAt, application: manifest.application };
    return report;
  } finally {
    input.unpipe && input.unpipe(parser);
    fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { create, restore, summary, BackupError, FORMAT, VERSION, PARTS };
