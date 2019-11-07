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
      torrent.files.forEach((fileContent) => {
        let folder = fileContent.path.split(('/')).slice(0, -1).join("/");
        if (folder) {
          console.log("Creating dir: ", folder);
          fs.mkdirSync(`${folderContainer}/${folder}`, { recursive: true });
        }
        var newPath = `${folderContainer}/${fileContent.path}`;
        fs.writeFileSync(newPath, fileContent);
        // while still seeding need to make sure file.path points to the right place
      });

      torrent.on('done', () => {
        console.log('torrent download finished');
        fs.unlinkSync(file);
      })
    });
  }

}

module.exports = new TorrentDownloader();
