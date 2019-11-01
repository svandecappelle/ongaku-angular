const nconf = require("nconf");
const _ = require("underscore");
const LastfmAPI = require('lastfmapi');


class LastfmConnector {

  connect() {
    this.wikipediaConnector = require("./wikipedia");

    if (nconf.get('third-party:lastfm:api-key')) {
      this.setup = true;

      this.lfm = new LastfmAPI({
        'api_key': nconf.get('third-party:lastfm:api-key'),
        'secret': nconf.get('third-party:lastfm:secret')
      });
    }
  }

  getArtistInfo(artist) {
    return new Promise((resolve, reject) => {
      if (this.setup) {
        this.lfm.artist.getInfo({
          'artist': artist.artist.trim(),
        }, (err, art) => {
          if (err) {
            console.warn("artist '" + artist.artist + "' not found");
          }
          artist = _.extend(artist, _.omit(art, 'image'));
          console.debug("image artist '" + artist.artist + "': " +
            artist.image);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getAlbumInfo(artist, album) {
    return new Promise((resolve, reject) => {
      this.lfm.album.getInfo({
        'artist': artist.artist.trim(),
        'album': album.album_origin ? album.album_origin.trim() : album
          .title
          .trim()
      }, (err, alb) => {
        if (err) {
          console.warn("[" + artist.artist + "] -> album:: '" +
            album
            .title +
            "' not found");
        }

        // parse function allow not defined images
        album.cover = this.parseLastFmImage(alb);
        album.image = album.cover;
        album = _.extend(album, _.omit(alb, 'image'));
        resolve(album);
      });
    });
  }

  parseLastFmImage(object) {
    var imageList;
    var imageSource;
    var sizes = ['small', 'medium', 'large', 'extralarge', 'mega'];
    var images = null;

    if (object && object.image) {
      imageList = object.image;
      if (!object.image[0]['#text']) {
        object.image = _.map(sizes, (size) => {
          return {
            '#text': '/static/img/album.png',
            size: size
          };
        });
      }
    }

    if (imageList) {
      images = _.map(_.sortBy(imageList, (image) => {
        return sizes.indexOf(image.size);
      }), (image) => {
        return image['#text'] ? image['#text'] :
          '/static/img/album.png';
      });
    }
    images = _.compact(images);
    return images;
  }
}

module.exports = new LastfmConnector();
