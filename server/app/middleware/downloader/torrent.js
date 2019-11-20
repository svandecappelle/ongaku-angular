const chokidar = require('chokidar');
const path = require("path");
const nconf = require("nconf");
const fs = require("fs");
const WebTorrent = require('webtorrent');
const parseTorrent = require('parse-torrent')


class TorrentDownloader {

  constructor() {

    this.client = new WebTorrent();
  }

  watch() {
    if (!fs.existsSync(`${nconf.get('library')[0]}/.torrents`)) {
      fs.mkdirSync(`${nconf.get('library')[0]}/.torrents`);
    }
    var watcher = chokidar.watch(`${nconf.get('library')[0]}/.torrents`, {
      ignored: /^\./,
      persistent: true
    });

    watcher.on('add', (file) => {
      if (path.extname(file) === ".torrent") {
        this.add(file, false);
      }
    });

    var watcherUsers = chokidar.watch(`${path.resolve(__dirname, "../../../../public/user")}`, {
      ignored: /^\./,
      persistent: true
    });
    watcherUsers.on('add', (file) => {
      if (path.extname(file) === ".torrent") {
        console.log('File', file, 'has been added');
        this.add(file, true);
      }
    });
  }

  add(file, userdir) {
    const torrentContent = parseTorrent(fs.readFileSync(file));
    const folderContainer = userdir ? path.dirname(file) : nconf.get('library')[0];
    this.client.add(torrentContent, (torrent) => {
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
