const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const library = require('./library');

// A Docker volume (docker-compose.yml): the music folder is read only
const LYRICS_DIRECTORY = path.resolve(__dirname, '../../../public/lyrics');
const MAX_SIZE = 256 * 1024;

/**
 * Lyrics of the tracks, plain or synced (LRC). Sources, in order:
 * - the lyrics saved by an administrator, kept by artist, album and title so that the
 *   copies of a track share them and they survive a move of the files;
 * - a .lrc file next to the track;
 * - the lyrics tag of the file.
 */
class Lyrics {
  get maxSize() {
    return MAX_SIZE;
  }

  customPath(track) {
    const normalize = (value) => String(value === undefined || value === null ? '' : value).trim().toLowerCase();
    const key = [library.albumArtistOf(track), track.album, track.metadatas && track.metadatas.title ? track.metadatas.title : track.title]
      .map(normalize).join('\u0000');
    return path.join(LYRICS_DIRECTORY, crypto.createHash('sha1').update(key).digest('hex') + '.lrc');
  }

  sidecarPath(track) {
    return track.file ? path.join(path.dirname(track.file), path.basename(track.file, path.extname(track.file)) + '.lrc') : null;
  }

  /** Lyrics in the tags: "lyrics", "LYRICS", "lyrics-eng" (mp3 USLT), "UNSYNCEDLYRICS"... */
  tagLyrics(track) {
    const tags = track.metadatas || {};
    const key = Object.keys(tags).find((name) => /lyrics/i.test(name) && typeof tags[name] === 'string' && tags[name].trim());
    return key ? tags[key] : null;
  }

  readText(file) {
    try {
      const stat = fs.statSync(file);
      return stat.isFile() && stat.size <= MAX_SIZE ? fs.readFileSync(file, 'utf8').replace(/^﻿/, '') : null;
    } catch (err) {
      return null;
    }
  }

  /** { source: 'custom' | 'file' | 'tags' | null, lrc } */
  read(track) {
    const custom = this.readText(this.customPath(track));
    if (custom !== null) {
      return { source: 'custom', lrc: custom };
    }
    const sidecar = this.sidecarPath(track);
    const file = sidecar ? this.readText(sidecar) : null;
    if (file !== null && file.trim()) {
      return { source: 'file', lrc: file };
    }
    const tags = this.tagLyrics(track);
    return tags ? { source: 'tags', lrc: tags } : { source: null, lrc: null };
  }

  write(track, lrc) {
    fs.mkdirSync(LYRICS_DIRECTORY, { recursive: true });
    const target = this.customPath(track);
    fs.writeFileSync(target + '.tmp', lrc, 'utf8');
    fs.renameSync(target + '.tmp', target);
  }

  remove(track) {
    fs.rmSync(this.customPath(track), { force: true });
  }
}

module.exports = new Lyrics();
