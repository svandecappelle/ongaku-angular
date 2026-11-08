const { Transform, Readable } = require('stream');

/** Time to wait for a station to answer */
const CONNECT_TIMEOUT = 10 * 1000;
/** Time a test listens to the stream for a title */
const PROBE_TIME = 6 * 1000;
/** Largest playlist file read (.pls, .m3u) */
const MAX_PLAYLIST = 64 * 1024;
const PLAYLIST_TYPES = ['audio/x-scpls', 'application/pls+xml', 'audio/mpegurl', 'audio/x-mpegurl', 'application/x-mpegurl', 'application/vnd.apple.mpegurl'];

class StreamError extends Error {}

/** An http(s) address, or null */
function streamUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch (e) {
    return null;
  }
}

function mediaType(response) {
  return String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

/** Browsers do not know some radio types: the same data under the type they play */
function playableType(type) {
  if (type === 'audio/aacp' || type === 'audio/x-aac') {
    return 'audio/aac';
  }
  if (type === 'audio/mp3' || type === 'audio/x-mpeg') {
    return 'audio/mpeg';
  }
  return type;
}

function isAudio(type) {
  return type.startsWith('audio/') || type === 'application/ogg' || type === 'video/mp2t';
}

async function connect(url, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT);
  const abort = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', abort, { once: true });
  }
  try {
    const response = await fetch(url, { headers: { 'Icy-MetaData': '1', 'User-Agent': 'Ongaku' }, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new StreamError(`The station answered ${response.status}`);
    }
    return { response, controller };
  } catch (err) {
    if (err instanceof StreamError) {
      throw err;
    }
    throw new StreamError(controller.signal.aborted && !signal?.aborted ? 'The station did not answer' : 'The station cannot be reached');
  } finally {
    clearTimeout(timer);
  }
}

async function readText(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_PLAYLIST) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(Buffer.from(value));
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

/** First stream address of a .pls or .m3u playlist */
function playlistEntry(text) {
  if (/#EXT-X-/.test(text)) {
    throw new StreamError('HLS streams are not supported yet');
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  for (const line of lines) {
    const entry = /^File\d+=(.+)$/i.exec(line);
    const candidate = entry ? entry[1] : (!line.startsWith('#') && !line.startsWith('[') ? line : null);
    if (candidate && streamUrl(candidate)) {
      return streamUrl(candidate);
    }
  }
  throw new StreamError('The playlist holds no stream address');
}

/**
 * Opens a station: follows a playlist (.pls, .m3u) to its first stream.
 * Resolves with { url, response, controller } on an audio stream.
 */
async function open(url, signal, depth = 0) {
  const { response, controller } = await connect(url, signal);
  const type = mediaType(response);
  const looksLikePlaylist = PLAYLIST_TYPES.includes(type) || ((type.startsWith('text/') || type === 'application/octet-stream') && /\.(pls|m3u8?)(\?|$)/i.test(url));
  if (looksLikePlaylist) {
    if (depth > 2) {
      throw new StreamError('Too many playlists in a row');
    }
    return open(playlistEntry(await readText(response)), signal, depth + 1);
  }
  if (!isAudio(type)) {
    response.body?.cancel().catch(() => {});
    throw new StreamError(type ? `Not an audio stream (${type})` : 'Not an audio stream');
  }
  return { url, response, controller };
}

/** The title of an ICY metadata block: StreamTitle='Artist - Title'; */
function titleOf(metadata) {
  const match = /StreamTitle='(.*?)';/s.exec(metadata);
  return match ? match[1].trim() || null : null;
}

/**
 * Removes the ICY metadata blocks from a stream (every `metaint` bytes of audio: one length
 * byte, then length × 16 bytes of text) and reports the titles they carry.
 */
class IcyStripper extends Transform {
  constructor(metaint, onTitle) {
    super();
    this.metaint = metaint;
    this.onTitle = onTitle;
    this.audioLeft = metaint;
    this.metaLeft = -1;
    this.meta = [];
  }

  _transform(chunk, encoding, callback) {
    let offset = 0;
    while (offset < chunk.length) {
      if (this.audioLeft > 0) {
        const size = Math.min(this.audioLeft, chunk.length - offset);
        this.push(chunk.subarray(offset, offset + size));
        offset += size;
        this.audioLeft -= size;
      } else if (this.metaLeft < 0) {
        this.metaLeft = chunk[offset] * 16;
        offset += 1;
        if (this.metaLeft === 0) {
          this.endBlock();
        }
      } else {
        const size = Math.min(this.metaLeft, chunk.length - offset);
        this.meta.push(chunk.subarray(offset, offset + size));
        offset += size;
        this.metaLeft -= size;
        if (this.metaLeft === 0) {
          const title = titleOf(Buffer.concat(this.meta).toString('utf8'));
          if (title) {
            this.onTitle(title);
          }
          this.endBlock();
        }
      }
    }
    callback();
  }

  endBlock() {
    this.meta = [];
    this.metaLeft = -1;
    this.audioLeft = this.metaint;
  }
}

/** The audio of an opened station, without its metadata; titles go to onTitle */
function audioStream(response, onTitle) {
  const body = Readable.fromWeb(response.body);
  const metaint = parseInt(response.headers.get('icy-metaint'), 10);
  if (!(metaint > 0)) {
    return body;
  }
  const stripper = new IcyStripper(metaint, onTitle);
  // pipe() does not pass the errors on: an aborted connection would be an uncaught error
  body.on('error', (err) => stripper.destroy(err));
  stripper.on('close', () => body.destroy());
  return body.pipe(stripper);
}

/** What a station says about itself, from its headers */
function describe(response) {
  const header = (name) => (response.headers.get(name) || '').trim() || null;
  return {
    type: playableType(mediaType(response)),
    name: header('icy-name'),
    genre: header('icy-genre'),
    bitrate: parseInt(header('icy-br'), 10) || null,
  };
}

/** Tests a station: { url (the stream, after playlists), type, name, genre, bitrate, title } */
async function probe(url) {
  const opened = await open(url);
  const info = describe(opened.response);
  let title = null;
  await new Promise((resolve) => {
    const stream = audioStream(opened.response, (value) => {
      title = value;
      done();
    });
    const timer = setTimeout(done, PROBE_TIME);
    stream.on('error', done);
    stream.on('end', done);
    stream.resume();
    function done() {
      clearTimeout(timer);
      opened.controller.abort();
      stream.destroy();
      resolve();
    }
  });
  return Object.assign({ url: opened.url, title }, info);
}

module.exports = { StreamError, streamUrl, open, probe, audioStream, describe, playableType, IcyStripper, titleOf };
