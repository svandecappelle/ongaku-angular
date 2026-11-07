const fs = require('fs');
const path = require('path');
const tar = require('tar');
const yauzl = require('yauzl');
const nconf = require('nconf');
const logger = require('log4js').getLogger("Importer");

/**
 * Unpack uploaded archives (zip, tar, tar.gz) or single audio files into a library folder.
 * Only files with an extension listed in the 'audio' configuration are kept.
 */
class Importer {

  isAudio(filename) {
    const ext = path.extname(filename).replace(".", "").toLowerCase();
    return (nconf.get("audio") || []).includes(ext);
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
    return this.archiveType(filename) !== null || this.isAudio(filename);
  }

  /**
   * Import the uploaded file stored at `source` (named `filename` by the client) into `destination`.
   * Resolves with the paths, relative to `destination`, of the imported audio files.
   */
  async import(source, filename, destination) {
    switch (this.archiveType(filename)) {
      case "zip":
        return this.extractZip(source, destination);
      case "tar":
        return this.extractTar(source, destination);
      default:
        if (!this.isAudio(filename)) {
          throw new Error(`Unsupported file type: ${filename}`);
        }
        const name = path.basename(filename);
        await fs.promises.copyFile(source, path.join(destination, name));
        return [name];
    }
  }

  async extractTar(source, destination) {
    const imported = [];
    // node-tar strips absolute paths and '..' segments unless preservePaths is set
    await tar.x({
      file: source,
      cwd: destination,
      filter: (entryPath, entry) => {
        const keep = entry.type === "File" && this.isAudio(entryPath);
        if (keep) {
          imported.push(entryPath);
        }
        return keep;
      }
    });
    return imported;
  }

  extractZip(source, destination) {
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
          // Directories and non audio files are skipped
          if (entry.fileName.endsWith("/") || !this.isAudio(relative)) {
            return zip.readEntry();
          }
          if (!target.startsWith(root + path.sep)) {
            logger.warn(`Skipping unsafe zip entry: ${entry.fileName}`);
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
