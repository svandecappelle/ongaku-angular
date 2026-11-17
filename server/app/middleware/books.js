const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const he = require('he');
const nconf = require('nconf');
const yauzl = require('yauzl');

const gallery = require('./gallery');
const video = require('./video');

/**
 * The books of the library (PDF and EPUB): what the scan keeps of each of them, and their
 * covers, made once. They are read in the browser (see routes/api/books.js).
 *
 * The title and the author of an EPUB come from its package document. The ones of a PDF, its
 * number of pages and its cover need pdfinfo and pdftoppm (poppler-utils): without them a PDF is
 * listed under the name of its file, without a cover.
 */

const DEFAULT_EXTENSIONS = ['pdf', 'epub'];
const MIME_TYPES = { pdf: 'application/pdf', epub: 'application/epub+zip' };
/** The longest side of a cover, in pixels */
const COVER_SIZE = 640;
const TOOL_TIMEOUT = 30 * 1000;
const MAX_COVER_JOBS = 2;
/** Read from an EPUB at most: its package document, and its cover image */
const MAX_XML = 5 * 1024 * 1024;
const MAX_COVER = 40 * 1024 * 1024;
const COVER_IMAGES = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };
/** Cache of the covers: a dot folder, which express.static does not serve (see video.js) */
const COVER_CACHE = path.resolve(__dirname, '../../../public/.cache/book-covers');

function extensionOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

/** The book extensions of the configuration ("book"), only the formats the reader opens */
function extensions() {
  const configured = [].concat(nconf.get('book') || DEFAULT_EXTENSIONS).map((ext) => String(ext).toLowerCase());
  return configured.filter((ext) => MIME_TYPES[ext]);
}

function isBook(file) {
  return extensions().includes(extensionOf(file));
}

// ---------- EPUB ----------

/** The entries of a zip by name, and a reader of one of them (at most `limit` bytes) */
function openZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err) {
        return reject(err);
      }
      const entries = new Map();
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.on('end', () => resolve({
        entries,
        close: () => zip.close(),
        read: (name, limit) => new Promise((done, fail) => {
          const entry = entries.get(name);
          if (!entry || entry.uncompressedSize > limit) {
            return fail(new Error(`No readable "${name}" in the archive`));
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err) {
              return fail(err);
            }
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', fail);
            stream.on('end', () => done(Buffer.concat(chunks)));
          });
        }),
      }));
      zip.readEntry();
    });
  });
}

/** The attributes of an XML tag: `<item id="a" href='b'/>` -> { id: 'a', href: 'b' } */
function attributes(tag) {
  const found = {};
  const pattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(tag))) {
    found[match[1].toLowerCase()] = he.decode(match[2] ?? match[3]);
  }
  return found;
}

/** The text of the first `<dc:name>` of a package document */
function dublinCore(opf, name) {
  const match = new RegExp(`<(?:dc:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:dc:)?${name}>`, 'i').exec(opf);
  const text = match ? he.decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
  return text || null;
}

/** The package document of an EPUB (its text and its path in the archive) */
async function packageOf(zip) {
  const container = (await zip.read('META-INF/container.xml', MAX_XML)).toString('utf8');
  const rootfile = /<rootfile\b[^>]*>/i.exec(container);
  const name = rootfile ? attributes(rootfile[0])['full-path'] : null;
  if (!name) {
    throw new Error('No package document');
  }
  return { name, opf: (await zip.read(name, MAX_XML)).toString('utf8') };
}

/** Path in the archive of the cover image of an EPUB, null when it tells none */
function coverEntry(zip, { name, opf }) {
  const items = (opf.match(/<item\b[^>]*>/gi) || []).map(attributes);
  const meta = (opf.match(/<meta\b[^>]*>/gi) || []).map(attributes).find((tag) => tag.name === 'cover');
  const isImage = (item) => /^image\//.test(item['media-type'] || '') && item.href;
  const item = items.find((candidate) => isImage(candidate) && /(^|\s)cover-image(\s|$)/.test(candidate.properties || ''))
    || (meta && items.find((candidate) => isImage(candidate) && candidate.id === meta.content))
    || items.find((candidate) => isImage(candidate) && /cover/i.test(`${candidate.id} ${candidate.href}`));
  if (!item) {
    return null;
  }
  let href = item.href.split('#')[0];
  try {
    href = decodeURIComponent(href);
  } catch (err) {
    // Kept as written
  }
  const entry = path.posix.normalize(path.posix.join(path.posix.dirname(name), href));
  return zip.entries.has(entry) ? entry : null;
}

async function epubInfo(file) {
  const zip = await openZip(file);
  try {
    const { opf } = await packageOf(zip);
    return { title: dublinCore(opf, 'title'), author: dublinCore(opf, 'creator') };
  } finally {
    zip.close();
  }
}

// ---------- PDF (poppler-utils) ----------

/** Tools that are not installed: asked once */
const missingTools = new Set();

/** Runs a tool and resolves with its output; rejects when it fails or is not installed */
function run(tool, args) {
  return new Promise((resolve, reject) => {
    if (missingTools.has(tool)) {
      return reject(new Error(`${tool} is not installed`));
    }
    const child = spawn(tool, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), TOOL_TIMEOUT);
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        missingTools.add(tool);
      }
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(new Error(`${tool} failed (${code}): ${errors.trim()}`));
    });
  });
}

/** Titles the tools write by themselves: "Microsoft Word - report.docx", "untitled" */
function meaningful(title) {
  const text = String(title || '').trim();
  return text && !/^untitled$/i.test(text) && !/\.[a-z0-9]{2,5}$/i.test(text) ? text : null;
}

async function pdfInfo(file) {
  const output = await run('pdfinfo', ['-enc', 'UTF-8', file]);
  const field = (name) => {
    const match = new RegExp(`^${name}:[ \\t]*(.*)$`, 'm').exec(output);
    return match ? match[1].trim() : '';
  };
  const pages = parseInt(field('Pages'), 10);
  return { title: meaningful(field('Title')), author: field('Author') || null, pages: Number.isFinite(pages) && pages > 0 ? pages : null };
}

// ---------- Library entries ----------

/** The library entry of a book file. Its tags are read when they can be: never fails on them */
async function describe(file) {
  const stat = await fs.promises.stat(file);
  const format = extensionOf(file);
  const info = await (format === 'epub' ? epubInfo(file) : pdfInfo(file)).catch(() => ({}));
  return {
    uid: crypto.createHash('sha1').update(file).digest('hex'),
    type: 'book',
    file,
    name: path.basename(file),
    title: info.title || video.titleFromName(file),
    author: info.author || null,
    folder: video.folderOf(file),
    format,
    mime: MIME_TYPES[format] || 'application/octet-stream',
    size: stat.size,
    modified: Math.round(stat.mtimeMs),
    pages: info.pages ?? null,
  };
}

/** What the client gets of a book: never the path on the server */
function publicBook(book) {
  const { uid, title, author, name, folder, format, size, modified, pages } = book;
  return { uid, title, author, name, folder, format, size, modified, pages, private: !!book.private };
}

// ---------- Covers ----------

let coverJobs = 0;
const coverQueue = [];
const coversRunning = new Map();
/** Books no cover can be made of, by cached name: not tried at each visit of the page */
const withoutCover = new Set();

function nextCover() {
  if (coverJobs >= MAX_COVER_JOBS || !coverQueue.length) {
    return;
  }
  coverJobs++;
  coverQueue.shift()().finally(() => {
    coverJobs--;
    nextCover();
  });
}

/** The first page of a PDF, as a JPEG written to `target` */
async function pdfCover(book, target) {
  const prefix = target.replace(/\.jpg$/, '');
  await run('pdftoppm', ['-f', '1', '-l', '1', '-jpeg', '-scale-to', String(COVER_SIZE), '-singlefile', book.file, prefix]);
}

/** The cover image an EPUB tells, scaled into a JPEG written to `target` */
async function epubCover(book, target) {
  const zip = await openZip(book.file);
  let source;
  try {
    const entry = coverEntry(zip, await packageOf(zip));
    const extension = entry ? COVER_IMAGES[extensionOf(entry)] : null;
    if (!extension) {
      throw new Error('No cover image in this book');
    }
    // Its extension is one of ours: nothing of the archive is in the name of the file
    source = path.join(os.tmpdir(), `ongaku-cover-${crypto.randomBytes(8).toString('hex')}.${extension}`);
    await fs.promises.writeFile(source, await zip.read(entry, MAX_COVER));
    await gallery.scale(source, target, COVER_SIZE);
  } finally {
    zip.close();
    if (source) {
      fs.promises.rm(source, { force: true }).catch(() => {});
    }
  }
}

/**
 * Path of the cover of a book (a JPEG), made once and made again when the file changes (size
 * and date in the name of the cached image). Rejects when the book has none.
 */
async function coverOf(book) {
  const target = path.join(COVER_CACHE, `${book.uid}-${book.size}-${book.modified}.jpg`);
  if (fs.existsSync(target)) {
    return target;
  }
  if (withoutCover.has(target)) {
    throw new Error('No cover can be made of this book');
  }
  if (coversRunning.has(target)) {
    return coversRunning.get(target);
  }
  const job = new Promise((resolve, reject) => {
    coverQueue.push(async () => {
      const temporary = `${target}.${process.pid}.tmp.jpg`;
      try {
        await fs.promises.mkdir(COVER_CACHE, { recursive: true });
        await (book.format === 'epub' ? epubCover(book, temporary) : pdfCover(book, temporary));
        await fs.promises.rename(temporary, target);
        resolve(target);
      } catch (err) {
        withoutCover.add(target);
        fs.promises.rm(temporary, { force: true }).catch(() => {});
        reject(err);
      }
    });
    nextCover();
  }).finally(() => coversRunning.delete(target));
  coversRunning.set(target, job);
  return job;
}

module.exports = { describe, publicBook, coverOf, isBook, extensions, DEFAULT_EXTENSIONS, MIME_TYPES };
