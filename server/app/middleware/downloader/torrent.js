const chokidar = require('chokidar');
const path = require("path");
const nconf = require("nconf");
const fs = require("fs");
// webtorrent and parse-torrent are ESM only (with top-level await), so they must be loaded with import()
const loadWebTorrent = () => import('webtorrent').then((module) => module.default);
const loadParseTorrent = () => import('parse-torrent').then((module) => module.default);


class TorrentDownloader {

  getClient() {
    if (!this.client) {
      this.client = loadWebTorrent().then((WebTorrent) => new WebTorrent());
    }
    return this.client;
  }

  watch() {
    // Torrents dropped in the .torrents folder of the library; the library can be read only (Docker)
    const libraryTorrents = `${nconf.get('library')[0]}/.torrents`;
    try {
      fs.mkdirSync(libraryTorrents, { recursive: true });
      var watcher = chokidar.watch(libraryTorrents, {
        ignored: /^\./,
        persistent: true
      });
      watcher.on('add', (file) => {
        if (path.extname(file) === ".torrent") {
          this.add(file, false).catch((err) => console.error(`Unable to add torrent ${file}`, err));
        }
      });
    } catch (err) {
      console.info(`Torrents of the library folder disabled: ${libraryTorrents} can't be created (${err.code})`);
    }

    var watcherUsers = chokidar.watch(`${path.resolve(__dirname, "../../../../public/user")}`, {
      ignored: /^\./,
      persistent: true
    });
    watcherUsers.on('add', (file) => {
      if (path.extname(file) === ".torrent") {
        console.log('File', file, 'has been added');
        this.add(file, true).catch((err) => console.error(`Unable to add torrent ${file}`, err));
      }
    });
  }

  async add(file, userdir) {
    const parseTorrent = await loadParseTorrent();
    const torrentContent = await parseTorrent(fs.readFileSync(file));
    const folderContainer = userdir ? path.dirname(file) : nconf.get('library')[0];
    const client = await this.getClient();
    client.add(torrentContent, (torrent) => {
      // Got torrent metadata!
      torrent.files.forEach((file) => {
        let folder = file.path.split(('/')).slice(0, -1).join("/");
        if (folder) {
          console.log("Creating dir: ", folder);
          fs.mkdirSync(`${folderContainer}/${folder}`, { recursive: true });
        }
        var newPath = `${folderContainer}/${file.path}`;
        console.log("create file: ", newPath);

        const rstream = file.createReadStream();
        var wstream = fs.createWriteStream(newPath);
        rstream.pipe(wstream);
        // while still seeding need to make sure file.path points to the right place
      });

      torrent.on('download', function (bytes) {
        console.log('just downloaded: ' + bytes)
        console.log('total downloaded: ' + torrent.downloaded)
        console.log('download speed: ' + torrent.downloadSpeed)
        console.log('progress: ' + torrent.progress)
      });

      torrent.on('done', () => {
        console.log('torrent download finished');
        fs.unlinkSync(file);
      })
    });
  }

}

module.exports = new TorrentDownloader();
