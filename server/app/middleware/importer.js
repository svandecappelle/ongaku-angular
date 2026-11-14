const fs = require('fs');
const os = require('os');
const path = require('path');
const Busboy = require('busboy');
const tar = require('tar');
const yauzl = require('yauzl');
const nconf = require('nconf');
const logger = require('log4js').getLogger("Importer");

/**
 * Unpack uploaded archives (zip, tar, tar.gz) or single audio and video files into a library
 * folder. Only files with an extension listed in the 'audio' or 'video' configuration are kept.
 */
class Importer {

  extensionOf(filename) {
    return path.extname(filename).replace(".", "").toLowerCase();
  }

  isAudio(filename) {
    return [].concat(nconf.get("audio") || []).map(String).includes(this.extensionOf(filename));
  }

  isVideo(filename) {
    return [].concat(nconf.get("video") || []).map(String).includes(this.extensionOf(filename));
  }

  /** A file the library lists: music or video */
  isMedia(filename) {
    return this.isAudio(filename) || this.isVideo(filename);
  }

  archiveType(filename) {
    const name = filename.toLowerCase();
    if (name.endsWith(".zip")) {
      return "zip";
    }
    if (name.endsWith(".tar.gz") || name.endsWith(".tgz") || name.endsWith(".tar")) {
      return "tar";
    }
    return null;
  }

  isSupported(filename) {
    return this.archiveType(filename) !== null || this.isMedia(filename);
  }

  /**
   * Import the uploaded file stored at `source` (named `filename` by the client) into `destination`.
   * Resolves with the paths, relative to `destination`, of the imported files.
   * With a `budget` ({ remaining } bytes), the files that do not fit are skipped and counted
   * in `budget.skipped`.
   */
  async import(source, filename, destination, budget) {
    switch (this.archiveType(filename)) {
      case "zip":
        return this.extractZip(source, destination, budget);
      case "tar":
        return this.extractTar(source, destination, budget);
      default:
        if (!this.isMedia(filename)) {
          throw new Error(`Unsupported file type: ${filename}`);
        }
        const size = (await fs.promises.stat(source)).size;
        if (!this.fits(budget, size)) {
          throw new Error('Upload quota exceeded');
        }
        const name = path.basename(filename);
        await fs.promises.copyFile(source, path.join(destination, name));
        return [name];
    }
  }

  /** Takes `size` bytes from the budget when they fit; no budget: unlimited */
  fits(budget, size) {
    if (!budget || budget.remaining === null) {
      return true;
    }
    if (size > budget.remaining) {
      budget.skipped = (budget.skipped || 0) + 1;
      return false;
    }
    budget.remaining -= size;
    return true;
  }

  /**
   * Receive the files of a multipart request and import each of them into `destination`.
   * Resolves with one result per file: { file, imported } or { file, error }.
   */
  receive(req, destination, quota) {
    return new Promise((resolve) => {
      // Each file is buffered in a temporary folder, then unpacked (archives) or copied (audio files)
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ongaku-upload-'));
      const uploads = [];
      // Bytes the user may still upload (null: unlimited), shared by the files of the request
      const budget = { remaining: quota === undefined ? null : quota };
      const limits = budget.remaining === null ? {} : { fileSize: budget.remaining + 1 };
      const busboy = Busboy({ headers: req.headers, limits: limits });
      busboy.on('file', (fieldname, file, { filename }) => {
        if (!this.isSupported(filename)) {
          file.resume();
          uploads.push(Promise.resolve({ file: filename, error: 'Unsupported file type' }));
          return;
        }
        const tmpFile = path.join(tmpDir, `${uploads.length}`);
        // Files are imported one after the other, so the budget is taken in order
        const previous = uploads.length ? uploads[uploads.length - 1] : Promise.resolve();
        const received = new Promise((done, fail) => {
          file.pipe(fs.createWriteStream(tmpFile)).on('finish', done).on('error', fail);
        });
        uploads.push(Promise.all([received, previous]).then(() => {
          if (file.truncated) {
            throw new Error('Upload quota exceeded');
          }
          budget.skipped = 0;
          return this.import(tmpFile, filename, destination, budget);
        })
          .then((imported) => budget.skipped
            ? { file: filename, imported: imported, error: `Upload quota exceeded: ${budget.skipped} file(s) skipped` }
            : { file: filename, imported: imported })
          .catch((err) => {
            logger.error(`Cannot import ${filename}`, err.message);
            return { file: filename, error: err.message };
          }));
      });
      busboy.on('close', async () => {
        const results = await Promise.all(uploads);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve(results);
      });
      req.pipe(busboy);
    });
  }

  async extractTar(source, destination, budget) {
    const imported = [];
    // node-tar strips absolute paths and '..' segments unless preservePaths is set
    await tar.x({
      file: source,
      cwd: destination,
      filter: (entryPath, entry) => {
        const keep = entry.type === "File" && this.isMedia(entryPath) && this.fits(budget, entry.size);
        if (keep) {
          imported.push(entryPath);
        }
        return keep;
      }
    });
    return imported;
  }

  extractZip(source, destination, budget) {
    const root = path.resolve(destination);
    return new Promise((resolve, reject) => {
      yauzl.open(source, { lazyEntries: true }, (err, zip) => {
        if (err) {
          return reject(err);
        }
        const imported = [];
        zip.on("error", reject);
        zip.on("end", () => resolve(imported));
        zip.on("entry", (entry) => {
          const relative = path.normalize(entry.fileName);
          const target = path.resolve(root, relative);
          // Directories and the files that are neither music nor video are skipped
          if (entry.fileName.endsWith("/") || !this.isMedia(relative)) {
            return zip.readEntry();
          }
          if (!target.startsWith(root + path.sep)) {
            logger.warn(`Skipping unsafe zip entry: ${entry.fileName}`);
            return zip.readEntry();
          }
          if (!this.fits(budget, entry.uncompressedSize)) {
            return zip.readEntry();
          }
          fs.promises.mkdir(path.dirname(target), { recursive: true }).then(() => {
            zip.openReadStream(entry, (err, stream) => {
              if (err) {
                return reject(err);
              }
              const out = fs.createWriteStream(target);
              out.on("error", reject);
              out.on("finish", () => {
                imported.push(relative);
                zip.readEntry();
              });
              stream.pipe(out);
            });
          }, reject);
        });
        zip.readEntry();
      });
    });
  }
}

module.exports = new Importer();
