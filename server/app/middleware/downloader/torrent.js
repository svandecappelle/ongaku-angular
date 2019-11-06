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

    watcher
      .on('add', (file) => {
        if (path.extname(file) === ".torrent") {
          console.log('File', file, 'has been added');
          this.add(file);
        }
      });
  }

  add(file) {
    var torrentContent = parseTorrent(fs.readFileSync(file));
    this.client.add(torrentContent, (torrent) => {
      // Got torrent metadata!
      console.log('Client is downloading:', torrent.infoHash)

      torrent.files.forEach((fileContent) => {
        let folder = fileContent.path.split(('/')).slice(0, -1).join("/");
        if (folder) {
          console.log("Creating dir: ", folder);
          fs.mkdirSync(`${nconf.get('library')[0]}/${folder}`, { recursive: true });
        }
        var newPath = `${nconf.get('library')[0]}/${fileContent.path}`;
        fs.writeFileSync(newPath, fileContent);
        // while still seeding need to make sure file.path points to the right place
      });
    });
  }

}

module.exports = new TorrentDownloader();
