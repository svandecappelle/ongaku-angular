const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nconf = require('nconf');

const { uploadsRoot } = require('./uploads-path');

/**
 * The images a member uploaded: listed from his uploads folder, and their thumbnails, made
 * once by ffmpeg. Nobody else reads them (see routes/api/gallery.js).
 */

/** Read by the browsers; no SVG, which may hold scripts */
const DEFAULT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
const MIME_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
};
/** Thumbnail sizes asked by the client: the longest side, in pixels */
const THUMB_SIZES = [320, 640];
const THUMB_TIMEOUT = 30 * 1000;
const MAX_JOBS = 2;
/** Cache of the thumbnails: a dot folder, which express.static does not serve */
const CACHE = path.resolve(__dirname, '../../../public/.cache/thumbs');

function extensionOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

/** The image extensions of the configuration ("image"), only the ones the browsers show */
function extensions() {
  const configured = [].concat(nconf.get('image') || DEFAULT_EXTENSIONS).map((ext) => String(ext).toLowerCase());
  return configured.filter((ext) => MIME_TYPES[ext]);
}

function isImage(file) {
  return extensions().includes(extensionOf(file));
}

function mimeOf(file) {
  return MIME_TYPES[extensionOf(file)] || 'application/octet-stream';
}

/** Every image of the uploads of a member, the latest first: { path, name, folder, size, modified } */
async function list(username) {
  const root = uploadsRoot(username);
  const found = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && isImage(entry.name)) {
        try {
          const stat = await fs.promises.stat(full);
          const relative = path.relative(root, full).split(path.sep).join('/');
          found.push({
            path: relative,
            name: entry.name,
            folder: path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative),
            size: stat.size,
            modified: Math.round(stat.mtimeMs),
          });
        } catch (err) {
          // Deleted meanwhile
        }
      }
    }
  }
  await walk(root);
  return found.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
}

let jobs = 0;
const waiting = [];
const running = new Map();

function next() {
  if (jobs >= MAX_JOBS || !waiting.length) {
    return;
  }
  jobs++;
  waiting.shift()().finally(() => {
    jobs--;
    next();
  });
}

function scale(source, target, size) {
  return new Promise((resolve, reject) => {
    // The first frame (a GIF), within a square of `size`, never larger than the image
    const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-y', '-i', source, '-frames:v', '1',
      '-vf', `scale=w='min(${size},iw)':h='min(${size},ih)':force_original_aspect_ratio=decrease`,
      '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', target], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    const timer = setTimeout(() => ffmpeg.kill('SIGKILL'), THUMB_TIMEOUT);
    ffmpeg.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    ffmpeg.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      code === 0 && fs.existsSync(target) ? resolve(target) : reject(new Error(`ffmpeg failed (${code}): ${errors.trim()}`));
    });
  });
}

/**
 * Path of the thumbnail of an image (absolute path, with its stat), made once. Its name holds
 * the size and the date of the file: a replaced image gets a new thumbnail.
 */
async function thumbnail(username, file, stat, size) {
  const key = crypto.createHash('sha1').update(`${username}\u0000${file}`).digest('hex');
  const target = path.join(CACHE, `${key}-${size}-${stat.size}-${Math.round(stat.mtimeMs)}.jpg`);
  if (fs.existsSync(target)) {
    return target;
  }
  if (running.has(target)) {
    return running.get(target);
  }
  const job = new Promise((resolve, reject) => {
    waiting.push(async () => {
      try {
        await fs.promises.mkdir(CACHE, { recursive: true });
        const temporary = `${target}.${process.pid}.tmp`;
        await scale(file, temporary, size);
        await fs.promises.rename(temporary, target);
        resolve(target);
      } catch (err) {
        reject(err);
      }
    });
    next();
  }).finally(() => running.delete(target));
  running.set(target, job);
  return job;
}

module.exports = { list, isImage, mimeOf, thumbnail, extensions, THUMB_SIZES, DEFAULT_EXTENSIONS };
