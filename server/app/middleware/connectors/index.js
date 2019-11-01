class ApiConnector {

  constructor() {
    // Connectors are tree called
    // Begining to spotify it tries to setup config and fetch metadata on it
    this.default = require("./spotify");
  }

  async connect() {
    return this.default.connect();
  }

  getArtistInfo(artist) {
    return this.default.getArtistInfo(artist);
  }

  async getAlbumInfo(artist, album) {
    return this.default.getAlbumInfo(artist, album);
  }
}

module.exports = new ApiConnector();
