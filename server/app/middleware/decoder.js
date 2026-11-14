const fs = require("fs");
const logger = require("log4js").getLogger("Decoder");
const async = require("async");
const _ = require("underscore");
const path = require("path");
const nconf = require("nconf");
const uuid = require('uuid');
const crypto = require('crypto');
const ffmetadata = require("ffmetadata");
const mm = require('music-metadata');

/** Extension of a file, lower case and without its dot */
function extensionOf(filePath) {
  return path.extname(filePath).slice(1).toLowerCase();
}

/** A tag that may hold several values ("A" or ["A", "B"]), as one text: "A, B" */
function tagText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(', ');
  }
  return String(value).trim();
}

class Decoder {

  constructor (type) {
    this.type = type;
  }

  decode(filePath) {
    if (this.type === 'audio') {
      return this.audio(filePath);
    } else {
      return this.video(filePath);
    }
  }

  song(file, metadatas, duration) {
    var WMATags = ['DeviceConformanceTemplate', 'IsVBR', 'DeviceConformanceTemplate', 'PeakValue', 'AverageLevel'];

    metadatas = _.omit(metadatas, (value, key) => {
      return key.indexOf("WM") === 0;
    });

    metadatas = _.omit(metadatas, ['picture', 'encoder', 'metadatas']);
    metadatas = _.omit(metadatas, WMATags);

    var durationMin = Math.floor(duration / 60),
      durationSec = Math.floor(duration % 60),
      uuid,
      shasum = crypto.createHash('sha1');
    shasum.update(file);
    if (durationSec < 10) {
      durationSec = "0".concat(durationSec);
    }

    var originalEncoding = path.extname(file.replace(nconf.get("library"), "")).replace(".", "");
    if (!_.contains(["mp3", "ogg"], originalEncoding)) {
      originalEncoding = "mp3";
    }

    if (metadatas.genre && metadatas.genre.length === 0) {
      metadatas.genre = ["Unknown"];
    }

    // Several artists in the tag: "A, B" (they made the decoding fail, so the file was left out)
    var artist = tagText(metadatas.artist ? metadatas.artist : metadatas.ARTIST ? metadatas.ARTIST : metadatas.artistalbum ? metadatas.artistalbum : "Unknown artist") || "Unknown artist";

    if (metadatas.ALBUM) {
      metadatas.album = tagText(metadatas.ALBUM);
    } else if (Array.isArray(metadatas.album)) {
      metadatas.album = tagText(metadatas.album);
    }

    if (metadatas.TITLE) {
      metadatas.title = tagText(metadatas.TITLE);
    } else if (Array.isArray(metadatas.title)) {
      metadatas.title = tagText(metadatas.title);
    }

    if ((metadatas.disk && metadatas.disk.of > 1) || metadatas.TPA) {
      metadatas.album_origin = metadatas.album;
      var discNo;
      if (metadatas.TPA) {
        discNo = `${metadatas.TPA}`;
      } else {
        discNo = `${metadatas.disk.no}/${metadatas.disk.of}`;
      }
      metadatas.album = `${metadatas.album} Disk - ${discNo}`;
    }

    metadatas = _.orderKeysBy(metadatas);

    return {
      artist: artist,
      file: file,
      relativePath: typeof nconf.get("library") === 'String' ? file.replace(nconf.get("library"), "") : file,
      title: metadatas.title ? metadatas.title : path.basename(file.replace(nconf.get("library"), "")),
      album: metadatas.album ? metadatas.album : "Uknown album",
      metadatas: metadatas,
      duration: durationMin.toString().concat(":").concat(durationSec),
      uid: shasum.digest('hex'),
      encoding: originalEncoding,
      genre: metadatas.genre && metadatas.genre.join ? metadatas.genre.join(",") : "-"
    };
  };

  /** A video of the library: its duration, size and codecs read by ffprobe (see video.js) */
  video(filePath) {
    if (!this.check(filePath)) {
      return Promise.reject({ cause: 'not a video file' });
    }
    return require('./video').describe(filePath);
  };

  /** The file has an extension of this type; "Song.MP3" counts as mp3 */
  check(filePath) {
    return _.contains(nconf.get(this.type), extensionOf(filePath));
  }

  audio(filePath) {
    return new Promise((resolve, reject) => {
      if (_.contains(nconf.get('audio'), extensionOf(filePath))) {
        logger.debug("Loading using mm: ", filePath);
        try {
          // Check if ffmetadata is best than mm
          ffmetadata.read(filePath, (err, metadataFFMPEG) => {
            logger.debug(`libelement: ${filePath}`, err, metadataFFMPEG)
            if (err) {
              logger.error(`libelement: ${filePath}`, err);
              return reject(err);
            }

            mm.parseFile(filePath, { duration: true }).then((metadata) => {
              logger.debug(`libelement: ${filePath}`, metadataFFMPEG)
              resolve(this.song(filePath, metadataFFMPEG, metadata.format.duration));
            }).catch((err) => {
              logger.error(`libelement: ${filePath}`, err);
              reject(err);
            });
          });

        } catch (error) {
          reject(error);
        }
      } else {
        logger.error(`metadata-check: ${filePath} `)
        reject({ "cause": `Not an audio file to listen: ${filePath}` }); // asynchronously call the loop
      }
    });
  }
}

module.exports = {class: Decoder};
