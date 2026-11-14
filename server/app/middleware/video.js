const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nconf = require('nconf');

/** Containers and codecs the browsers play without help */
const PLAYABLE_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv']);
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

const MIME_TYPES = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', flv: 'video/x-flv', mpg: 'video/mpeg', mpeg: 'video/mpeg',
};

const PROBE_TIMEOUT = 20 * 1000;
const POSTER_TIMEOUT = 30 * 1000;
/** Posters made at once: the first visit of the Videos page must not load the server */
const MAX_POSTER_JOBS = 2;
/** Cache of the posters: a dot folder, which express.static does not serve (see peaks.js) */
const POSTER_CACHE = path.resolve(__dirname, '../../../public/.cache/posters');

function extensionOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

/** Duration, size and codecs of a video, read by ffprobe; empty when it cannot read them */
function probe(file) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => ffprobe.kill('SIGKILL'), PROBE_TIMEOUT);
    ffprobe.stdout.on('data', (chunk) => {
      output += chunk;
    });
    ffprobe.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
    ffprobe.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return resolve({});
      }
      try {
        const { format = {}, streams = [] } = JSON.parse(output);
        const video = streams.find((stream) => stream.codec_type === 'video' && !(stream.disposition && stream.disposition.attached_pic));
        const audio = streams.find((stream) => stream.codec_type === 'audio');
        const duration = Number(format.duration);
        resolve({
          duration: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
          width: video ? video.width || null : null,
          height: video ? video.height || null : null,
          videoCodec: video ? video.codec_name : null,
          audioCodec: audio ? audio.codec_name : null,
          title: format.tags && (format.tags.title || format.tags.TITLE) || null,
        });
      } catch (err) {
        resolve({});
      }
    });
  });
}

/** The browsers play it as it is (no transcoding of the videos) */
function isPlayable(extension, { videoCodec, audioCodec }) {
  return PLAYABLE_CONTAINERS.has(extension)
    && PLAYABLE_VIDEO.has(videoCodec)
    && (!audioCodec || PLAYABLE_AUDIO.has(audioCodec));
}

/** "My_holiday.video-2019" -> "My holiday video 2019" */
function titleFromName(file) {
  const name = path.basename(file, path.extname(file)).replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name || path.basename(file);
}

/** Folder of the video under the library folder holding it ("" at its root) */
function folderOf(file) {
  const roots = [].concat(nconf.get('library') || []).map((root) => path.resolve(String(root)));
  const dir = path.dirname(path.resolve(file));
  const root = roots.find((candidate) => dir === candidate || dir.startsWith(candidate + path.sep));
  return root ? path.relative(root, dir).split(path.sep).join('/') : path.basename(dir);
}

/** The library entry of a video file */
async function describe(file) {
  const [stat, info] = await Promise.all([fs.promises.stat(file), probe(file)]);
  const extension = extensionOf(file);
  return {
    uid: crypto.createHash('sha1').update(file).digest('hex'),
    type: 'video',
    file,
    name: path.basename(file),
    title: info.title || titleFromName(file),
    folder: folderOf(file),
    extension,
    mime: MIME_TYPES[extension] || 'application/octet-stream',
    size: stat.size,
    modified: Math.round(stat.mtimeMs),
    duration: info.duration ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
    videoCodec: info.videoCodec ?? null,
    audioCodec: info.audioCodec ?? null,
    playable: isPlayable(extension, info),
  };
}

/** What the client gets of a video: never the path on the server */
function publicVideo(video) {
  const { uid, title, name, folder, extension, mime, size, modified, duration, width, height, playable } = video;
  return { uid, title, name, folder, extension, mime, size, modified, duration, width, height, playable, private: !!video.private };
}

let posterJobs = 0;
const posterQueue = [];
const postersRunning = new Map();

function nextPoster() {
  if (posterJobs >= MAX_POSTER_JOBS || !posterQueue.length) {
    return;
  }
  posterJobs++;
  posterQueue.shift()().finally(() => {
    posterJobs--;
    nextPoster();
  });
}

function extractFrame(video, target) {
  // A frame a little into the video: the first ones are often black
  const at = video.duration ? Math.min(video.duration * 0.1, 30) : 1;
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', video.file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', '-f', 'image2', target], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    const timer = setTimeout(() => ffmpeg.kill('SIGKILL'), POSTER_TIMEOUT);
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
 * Path of the poster of a video (a JPEG frame), made once by ffmpeg and made again when the
 * file changes (size and date in the name of the cached image).
 */
async function posterOf(video) {
  const target = path.join(POSTER_CACHE, `${video.uid}-${video.size}-${video.modified}.jpg`);
  if (fs.existsSync(target)) {
    return target;
  }
  if (postersRunning.has(target)) {
    return postersRunning.get(target);
  }
  const job = new Promise((resolve, reject) => {
    posterQueue.push(async () => {
      try {
        await fs.promises.mkdir(POSTER_CACHE, { recursive: true });
        const temporary = `${target}.${process.pid}.tmp.jpg`;
        await extractFrame(video, temporary);
        await fs.promises.rename(temporary, target);
        resolve(target);
      } catch (err) {
        reject(err);
      }
    });
    nextPoster();
  }).finally(() => postersRunning.delete(target));
  postersRunning.set(target, job);
  return job;
}

module.exports = { describe, publicVideo, posterOf, probe, isPlayable, titleFromName };
