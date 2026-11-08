/**
 * Fixture of the test instance: a copy of the server with its own configuration, generated
 * music (ffmpeg), and files to upload. Everything lives in the temporary folder of the run.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Dependencies of the checkout. A git worktree has none of its own: they are taken from the
 * main checkout of the repository.
 */
export function resolveShared(root) {
  const roots = [root];
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
    const main = path.dirname(path.resolve(root, common));
    if (main !== root) {
      roots.push(main);
    }
  } catch {
    // Not a git checkout
  }
  const first = (relative) => roots.map((r) => path.join(r, relative)).find((candidate) => fs.existsSync(candidate)) ?? null;
  return {
    nodeModules: first('node_modules'),
    clientNodeModules: first('client/node_modules'),
    // The built client of this checkout only: another checkout may hold other code
    clientDist: fs.existsSync(path.join(root, 'client/dist/index.html')) ? path.join(root, 'client/dist') : null,
  };
}

/** The Chromium headless shell of Playwright, or $CHROME */
export function findChrome() {
  if (process.env.CHROME) {
    return fs.existsSync(process.env.CHROME) ? process.env.CHROME : null;
  }
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (!fs.existsSync(cache)) {
    return null;
  }
  for (const dir of fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
    const candidate = path.join(cache, dir, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`ffmpeg ${args.join(' ')}: ${result.stderr}`);
  }
}

/** An audio file with these tags; `seconds` long */
function tone(file, tags = {}, { seconds = 2, frequency = 440, codec = [] } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const metadata = Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value}`]);
  const quality = file.endsWith('.mp3') && !codec.length ? ['-q:a', '9'] : codec;
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${seconds}`, ...metadata, ...quality, file]);
}

function album(music, artist, title, count, { start = 300, folder, genre } = {}) {
  for (let n = 1; n <= count; n++) {
    tone(path.join(music, folder ?? path.join(artist, title), `${n}.mp3`), { artist, album: title, title: `${title} ${n}`, track: n, ...(genre ? { genre } : {}) }, { frequency: start + n * 37 });
  }
}

function zip(target, cwd, files) {
  // A minimal zip writer is not worth it: python3 is around wherever ffmpeg is, and so is "zip" most of the time
  const script = `import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED)\nfor f in sys.argv[2:]:\n    z.write(f)\nz.close()`;
  const result = spawnSync('python3', ['-I', '-c', script, target, ...files], { cwd });
  if (result.status !== 0) {
    throw new Error(`Cannot write ${target}: ${result.stderr}`);
  }
}

/** The music of the tests: every scenario relies on these names */
function buildMusic(music) {
  // Genres for the library radio stations
  album(music, 'Daft Punk', 'Discovery', 3, { genre: 'Electronic' });
  album(music, 'Radiohead', 'OK Computer', 4, { start: 500, genre: 'Rock' });
  album(music, 'Air', 'Moon Safari', 2, { start: 700, genre: 'Electronic' });
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', path.join(music, 'Air/Moon Safari/cover.jpg')]);

  // Duplicates of Discovery: track 1 in flac, track 2 with a lowercase artist
  tone(path.join(music, 'Copies/Discovery/01.flac'), { artist: 'Daft Punk', album: 'Discovery', title: 'Discovery 1', track: 1 }, { frequency: 337, codec: ['-c:a', 'flac'] });
  tone(path.join(music, 'Copies/Discovery/02.mp3'), { artist: 'daft punk', album: 'Discovery', title: 'Discovery 2', track: '2/3' }, { frequency: 374 });

  // The same album title by two artists, and a compilation
  album(music, 'Queen', 'Greatest Hits', 2, { start: 900 });
  album(music, 'ABBA', 'Greatest Hits', 2, { start: 1100 });
  tone(path.join(music, 'Compilations/Summer Mix/1.mp3'), { artist: 'Air', album_artist: 'Various Artists', album: 'Summer Mix', title: 'Mix Air', track: 1 }, { frequency: 1300 });
  tone(path.join(music, 'Compilations/Summer Mix/2.mp3'), { artist: 'Daft Punk', album_artist: 'Various Artists', album: 'Summer Mix', title: 'Mix Daft Punk', track: 2 }, { frequency: 1340 });

  // Library health: an album without cover, a file without tags, an unreadable file
  album(music, 'Zzyzx Qwertyband', 'Nothing Here Nowhere', 1, { start: 1500 });
  tone(path.join(music, 'Misc/Track 03.mp3'), {}, { frequency: 1600 });
  fs.writeFileSync(path.join(music, 'Misc/broken.mp3'), crypto.randomBytes(4000));

  // Lyrics: a .lrc next to a track, lyrics in the tags of another, none on the third
  const songs = path.join(music, 'Lyric Band/Songs');
  tone(path.join(songs, '01.mp3'), { artist: 'Lyric Band', album: 'Songs', title: 'Sidecar song', track: 1 }, { seconds: 20, frequency: 330 });
  fs.writeFileSync(path.join(songs, '01.lrc'), '[ti:Sidecar song]\n[00:00.50]First line from the file\n[00:03.00]Second line\n[00:06.00]Third line\n[00:09.00]Fourth line\n');
  tone(path.join(songs, '02.mp3'), { artist: 'Lyric Band', album: 'Songs', title: 'Tagged song', track: 2, lyrics: 'Plain lyrics from the tags\nSecond verse line' }, { seconds: 20, frequency: 360 });
  tone(path.join(songs, '03.mp3'), { artist: 'Lyric Band', album: 'Songs', title: 'No lyrics song', track: 3 }, { seconds: 20, frequency: 390 });

  // Deleted by the tests: each scenario has its own track
  tone(path.join(music, 'Victim/Delete Me/1.mp3'), { artist: 'Victim', album: 'Delete Me', title: 'Delete me admin', track: 1 }, { frequency: 1700 });
  tone(path.join(music, 'Victim/Delete Me/2.mp3'), { artist: 'Victim', album: 'Delete Me', title: 'Delete me user', track: 2 }, { frequency: 1740 });
  tone(path.join(music, 'Victim/Delete Me/3.mp3'), { artist: 'Victim', album: 'Delete Me', title: 'Delete me queued', track: 3 }, { frequency: 1780 });
  // Tags rewritten by the tests
  tone(path.join(music, 'Taggable/Tags/1.mp3'), { artist: 'Taggable', album: 'Tags', title: 'Retag me', track: 1 }, { frequency: 1800 });

  // Library audit: an upper-case extension (once skipped by the scan), a format not enabled,
  // another file, and a track the audit test moves away
  tone(path.join(music, 'Audit/Caps/1.MP3'), { artist: 'Caps Band', album: 'Shouting', title: 'Uppercase extension', track: 1 }, { frequency: 1900 });
  tone(path.join(music, 'Audit/Formats/1.m4a'), { artist: 'Formats Band', album: 'Formats', title: 'Not enabled', track: 1 }, { frequency: 1950, codec: ['-c:a', 'aac'] });
  fs.writeFileSync(path.join(music, 'Audit/notes.txt'), 'Not music');
  tone(path.join(music, 'Audit/Gone/1.mp3'), { artist: 'Gone Band', album: 'Gone', title: 'Moved away', track: 1 }, { frequency: 2000 });

  fs.mkdirSync(path.join(music, 'Imported'), { recursive: true });
}

/** Files uploaded by the tests */
function buildAssets(assets) {
  fs.mkdirSync(assets, { recursive: true });
  tone(path.join(assets, 'small.mp3'), { artist: 'Alice Band', album: 'Demo', title: 'Small upload', track: 1 }, { seconds: 3, frequency: 500 });
  tone(path.join(assets, 'private.mp3'), { artist: 'Secret Band', album: 'Hidden Album', title: 'Private upload', track: 1 }, { seconds: 2, frequency: 520 });
  tone(path.join(assets, 'big.mp3'), { artist: 'Alice Band', album: 'Demo', title: 'Big upload', track: 2 }, { seconds: 30, frequency: 600, codec: ['-b:a', '128k'] });
  const three = path.join(assets, 'three');
  for (let n = 1; n <= 3; n++) {
    tone(path.join(three, 'Band', `z${n}.mp3`), { artist: 'Zip Band', album: 'Zipped', title: `Zipped ${n}`, track: n }, { seconds: 3, frequency: 300 + n * 50 });
  }
  zip(path.join(assets, 'three.zip'), three, ['Band/z1.mp3', 'Band/z2.mp3', 'Band/z3.mp3']);
  // Highly compressible: the zip is small, its content is not (quota checked while unpacking)
  const silence = path.join(assets, 'silence');
  for (let n = 1; n <= 3; n++) {
    fs.mkdirSync(path.join(silence, 'S'), { recursive: true });
    ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1', '-metadata', `title=Silence ${n}`, path.join(silence, 'S', `s${n}.wav`)]);
  }
  zip(path.join(assets, 'silence.zip'), silence, ['S/s1.wav', 'S/s2.wav', 'S/s3.wav']);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', path.join(assets, 'image.png')]);
}

function applicationYml({ port, redisDb, music }) {
  return `product-name: application
log-level: error
port: ${port}
hostname: localhost
uploader: false
library: [${JSON.stringify(music)}]
importFolder: ${JSON.stringify(path.join(music, 'Imported'))}
audio: [mp3, wav, wma, ogg, flac]
video: [mp4, webm, flv, ogv, mpg]
defaultLanguage: fr
database: redis
type: browser
playingtype: streaming
redis:
    host: ${process.env.REDIS_HOST || '127.0.0.1'}
    port: ${Number(process.env.REDIS_PORT || 6379)}
    password: ${process.env.REDIS_PASSWORD || ''}
    database: ${redisDb}
secret: ${crypto.randomBytes(16).toString('hex')}
bcrypt_rounds: 4
gravatar: false
local: false
requireLogin: false
allowUpload: true
allowRegisteration: 10
# No API keys: the tests do not depend on Last.fm or Spotify
third-party:
    spotify:
        clientId:
        secret:
    lastfm:
        api-key:
        secret:
`;
}

/**
 * Builds the instance in `workDir`: music/, assets/, app/ (server copy, config, public/,
 * links to node_modules and to the built client).
 */
export function buildFixture({ root, workDir, port, redisDb, shared }) {
  const music = path.join(workDir, 'music');
  const assets = path.join(workDir, 'assets');
  const app = path.join(workDir, 'app');
  buildMusic(music);
  buildAssets(assets);

  // The server finds its configuration and public/ next to its code: a copy keeps the checkout clean
  fs.cpSync(path.join(root, 'server'), path.join(app, 'server'), { recursive: true });
  fs.writeFileSync(path.join(app, 'server/config/application.yml'), applicationYml({ port, redisDb, music }));
  // config.yml: the port, by environment (its database section is read but unused with Redis)
  const configYml = fs.readFileSync(path.join(root, 'server/config/config.yml'), 'utf8').replace(/^(\s*port:\s*)\d+/gm, `$1${port}`);
  fs.writeFileSync(path.join(app, 'server/config/config.yml'), configYml);
  fs.copyFileSync(path.join(root, 'package.json'), path.join(app, 'package.json'));
  fs.symlinkSync(shared.nodeModules, path.join(app, 'node_modules'), 'dir');
  fs.mkdirSync(path.join(app, 'public/user'), { recursive: true });
  fs.cpSync(path.join(root, 'public/img'), path.join(app, 'public/img'), { recursive: true });
  fs.mkdirSync(path.join(app, 'client'), { recursive: true });
  if (shared.clientDist) {
    fs.symlinkSync(shared.clientDist, path.join(app, 'client/dist'), 'dir');
  }
  return { music, assets, app, client: !!shared.clientDist };
}
