class Downloader {
  constructor() {
    this.torrent = require("./torrent");
  }

  watch() {
    this.torrent.watch();
  }
}

module.exports = new Downloader();
