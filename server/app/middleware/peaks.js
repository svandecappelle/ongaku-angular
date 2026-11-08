const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Values of a waveform */
const PEAKS = 400;
/** Samples a second decoded for the waveform: enough for its shape, cheap to read */
const SAMPLE_RATE = 8000;
/** Samples summed up by one value before the 400 are made (20 a second) */
const BLOCK = SAMPLE_RATE / 20;
/** At most this many ffmpeg at once: the first plays of a library must not load the server */
const MAX_JOBS = 2;
const TIMEOUT = 60 * 1000;
/**
 * Cache of the waveforms. A dot folder: express.static does not serve it, and it stays out of
 * the music folders (the library may be read only, and the old PNG waveforms were written there).
 */
const CACHE = path.resolve(__dirname, '../../../public/.cache/peaks');

const running = new Map();
const waiting = [];
let jobs = 0;

function cacheFile(uid) {
  return path.join(CACHE, `${uid}.json`);
}

/** The loudest sample of each block, from the raw 16-bit mono stream of ffmpeg */
function decode(file) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const blocks = [];
    let current = 0;
    let count = 0;
    let rest = null;
    let errors = '';
    const timer = setTimeout(() => ffmpeg.kill('SIGKILL'), TIMEOUT);
    ffmpeg.stdout.on('data', (chunk) => {
      let data = rest ? Buffer.concat([rest, chunk]) : chunk;
      const even = data.length - (data.length % 2);
      rest = even < data.length ? data.subarray(even) : null;
      for (let i = 0; i < even; i += 2) {
        const value = Math.abs(data.readInt16LE(i));
        if (value > current) {
          current = value;
        }
        if (++count === BLOCK) {
          blocks.push(current);
          current = 0;
          count = 0;
        }
      }
    });
    ffmpeg.stderr.on('data', (chunk) => {
      errors = (errors + chunk).slice(-500);
    });
    ffmpeg.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      if (count) {
        blocks.push(current);
      }
      if (code !== 0 || !blocks.length) {
        return reject(new Error(`ffmpeg failed (${code}): ${errors.trim()}`));
      }
      resolve(blocks);
    });
  });
}

/** 400 values from 0 to 255, the loudest part of the track at 255 */
function summarize(blocks) {
  const peaks = [];
  for (let i = 0; i < PEAKS; i++) {
    const from = Math.floor((i * blocks.length) / PEAKS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * blocks.length) / PEAKS));
    let max = 0;
    for (let j = from; j < to && j < blocks.length; j++) {
      max = Math.max(max, blocks[j]);
    }
    peaks.push(max);
  }
  const loudest = Math.max(1, ...peaks);
  // A little lift for the quiet parts: a linear scale hides them
  return peaks.map((value) => Math.round(Math.pow(value / loudest, 0.8) * 255));
}

function nextJob() {
  while (jobs < MAX_JOBS && waiting.length) {
    const job = waiting.shift();
    jobs++;
    job().finally(() => {
      jobs--;
      nextJob();
    });
  }
}

function queued(task) {
  return new Promise((resolve, reject) => {
    waiting.push(() => task().then(resolve, reject));
    nextJob();
  });
}

/**
 * The waveform of a track: 400 values from 0 to 255. Read from the cache when the file did not
 * change since (same size and date), else computed by ffmpeg and saved.
 */
async function peaksOf(track) {
  const stat = await fs.promises.stat(track.file);
  const stamp = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  try {
    const cached = JSON.parse(await fs.promises.readFile(cacheFile(track.uid), 'utf8'));
    if (cached.stamp === stamp && Array.isArray(cached.peaks) && cached.peaks.length === PEAKS) {
      return cached.peaks;
    }
  } catch (err) {
    // Not computed yet, or unreadable: computed again
  }
  // The same track asked twice at once is computed once
  if (running.has(track.uid)) {
    return running.get(track.uid);
  }
  const job = queued(async () => {
    const peaks = summarize(await decode(track.file));
    try {
      await fs.promises.mkdir(CACHE, { recursive: true });
      await fs.promises.writeFile(cacheFile(track.uid), JSON.stringify({ stamp, peaks }));
    } catch (err) {
      console.warn(`The waveform of ${track.uid} could not be cached: ${err.message}`);
    }
    return peaks;
  }).finally(() => running.delete(track.uid));
  running.set(track.uid, job);
  return job;
}

module.exports = { peaksOf, PEAKS, CACHE };
