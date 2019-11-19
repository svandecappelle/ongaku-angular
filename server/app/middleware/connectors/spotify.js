const nconf = require("nconf");
const _ = require("underscore");
const SpotifyWebApi = require('spotify-web-api-node');


class SpotifyConnector {

  constructor() {
    this.lastfmConnector = require("./lastfm");
    this.lastfmConnector.connect();

    this.wikipediaConnector = require("./wikipedia");

    this.spotifyApi = new SpotifyWebApi({
      clientId: nconf.get('third-party:spotify:clientId'),
      clientSecret: nconf.get('third-party:spotify:secret'),
    });
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (nconf.get('third-party:spotify:clientId')) {
        this.setup = true;

        this.spotifyApi.clientCredentialsGrant().then((data) => {
          console.log('The access token is ' + data.body[
            'access_token']);
          this.spotifyApi.setAccessToken(data.body['access_token']);
          resolve();
        }, (err) => {
          console.log('Something went wrong!', err);
          reject(err);
        });
      } else {
        resolve();
      }
    });
  }

  getArtistInfo(artist) {
    return new Promise((resolve, reject) => {
      if (!artist.artist) {
        return reject("Artist is undefined");
      }
      if (this.setup) {
        this.spotifyApi.searchArtists(artist.artist.trim()).then((data) => {
          if (_.isEmpty(data.body.artists.items)) {
            return reject(`No artist found on spotify matching criterias ${artist.artist.trim()}`);
          }
          artist.image = _.pluck(data.body.artists.items[0].images,
            "url");

          this.lastfmConnector.getArtistInfo(artist).then(data => {
            this.wikipediaConnector.getArtistInfo(artist).then(
              data => {
                resolve(artist);
              }).catch(error => {
                reject(error);
              });
          }).catch(error => {
            reject(error);
          });
        }).catch(error => {
          reject(error);
        });
      } else {
        artist.image = ['/static/img/album.png'];

        this.lastfmConnector.getArtistInfo(artist).then(data => {
          resolve(artist);
        }).catch(error => {
          reject(error);
        });
      }
    });
  }

  async getAlbumInfo(artist, album) {
    return new Promise((resolve, reject) => {
      return this.lastfmConnector.getAlbumInfo(artist, album).then(data => {
        resolve(data);
      });
    });
  }
}

module.exports = new SpotifyConnector();
