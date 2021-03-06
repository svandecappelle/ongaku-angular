const scan = require("./scanner");
const _ = require("underscore");
const logger = require("log4js").getLogger('Library');
const nconf = require("nconf");
const path = require("path");
const fs = require("fs");
const async = require("async");
const getSize = require('get-folder-size');
const connector = require("./connectors");

var library;
try {
  library = require("../model/library");
} catch (err) {
  console.error(err);
}

const ffmetadata = require("ffmetadata");
const mm = require('musicmetadata');
var Decoder = require('./decoder').class;

_.mixin({
  groupByMulti: (obj, values, context) => {
    if (!values.length)
      return obj;
    //obj = _.sortBy(obj, values[0], context);
    var byFirst = _.groupBy(obj, values[0], context),
      rest = values.slice(1);
    for (var prop in byFirst) {
      byFirst[prop] = _.groupByMulti(byFirst[prop], rest, context);
    }
    return byFirst;
  }
});


class Library {

  constructor() {
    this.data = {
      audio: [],
      video: []
    };
    this.flatten = [];

    this.audioScanned = false;
    this.videoScanned = false;
    this.scanProgress = false;

    this.loadingCoverAlbums = [];
    this.loadingCoverArtists = [];
    this.loadingCoversAlbumsFlatten = [];

    this.coversLocation = [];
    scan.on('decoded', (song, type) => {
      console.debug("decoded", song, type);
      // this.flatten.push(song);
      try {
        var libraryElement = _.extend(song, {
          uuid: song.uid,
          type: 'audio',
          private: false,
          user: null
        });

        if (!libraryElement.metadatas) {
          libraryElement.metadatas = {};
        }

        // console.info("elem", libraryElement);
        libraryElement;

        var tracks = [libraryElement];
        let location = path.dirname(song.file);
        this.flatten = _.union(this.flatten, tracks);

        this.getArtistCover({
          artist: song.artist
        });

        var album = {
          title: song.album
        };

        if (album !== "Unknown album") {
          this.getAlbumCover({
            artist: song.artist
          }, album, location);
        } else {
          console.debug("already scanned album '" + album.title + "': " +
            this.loadingCoverAlbums[song.artist][album.title]);
        }

      } catch (err) {
        console.error('Error on decoding tracks: ', err)
      }
    });
  }

  async setupConnectors() {
    await connector.connect();
  };

  /**
   * Scan the library
   *
   */
  beginScan() {
    return new Promise((resolve, reject) => {
      scan.library().then((lib) => {
        if (Array.isArray(lib)) {
          _.each(lib, (libFolder) => {
            if (libFolder.audio) {
              this.populate("audio", libFolder);
            }
            if (libFolder.video) {
              this.populate("video", libFolder);
            }
          });
        } else {
          if (lib.audio) {
            this.populate("audio", lib);
          }
          if (lib.video) {
            this.populate("video", lib);
          }
        }
        resolve(lib);
      }, (error) => {
        console.error(`Error scanning library: `, error);
        reject(error);
      });
    });
  };

  /**
   * Add a folder to scan
   *
   * @param {String} folder path
   * @param {function} callback
   */
  addFolder(folder, callback) {
    var that = this;

    scan.addToScan(folder.path);
    this.removeFolder(folder);
    scan.scanFolder(folder.path).then((folderContent) => {
      folderContent.private = folder.private;

      if (folderContent.audio) {
        that.populate("audio", {
          folder: folder,
          content: folderContent
        }, folder);

        callback({
          type: 'audio'
        });
      } else if (folderContent.video) {
        callback({
          type: 'video'
        });
        // TODO desactivate at now scan video. Should be reactivated
        /*that.populate("video", {
          folder: folder,
          content: folderContent
        }, function (){
          callback({
            type: 'video'
          });
        }, folder);*/
      }
    })
  };

  /**
   * Remove folder from scanned library folders
   *
   * @param {String} folder remove the folder from scanned library folders
   */
  removeFolder(folder) {
    scan.removeToScan(folder.path);
    this.flatten = _.filter(this.flatten, (track) => {
      if (track.username && track.username === folder.username && folder.path ===
        track.userfolder) {
        return false;
      }
      return true;
    });
  }

  /**
   * Populate library with scanned elements.
   *
   * @param {String} type type of media: audio | video
   * @param {Object} folderScanResult object of all scanned results
   * @param {Object} folder folder path and state
   */
  populate(type, folderScanResult, folder) {
    var destination = this.data;
    var flattenDestination = this.flatten;
    var lib;
    var isPrivate = false;

    if (folderScanResult.content) {
      lib = folderScanResult.content[type];
      if (folderScanResult.folder.private) {
        isPrivate = true;
      }
    } else {
      lib = folderScanResult[type];
    }

    this.flatten = _.union(this.flatten, _.map(_.groupBy(lib, 'uid'), (track,
      uuid) => {

      var libraryElement = _.extend(track[0], {
        uuid: uuid,
        type: type,
        private: isPrivate,
        user: folderScanResult.folder ? folderScanResult.folder.username : null
      });

      if (!libraryElement.metadatas) {
        libraryElement.metadatas = {};
      }

      if (folder && folder.username) {
        // library is a user private but shared folder.
        _.extend(libraryElement, {
          username: folder.username
        });
        libraryElement.metadatas.sharedBy = folder.username;
        libraryElement.userfolder = folder.path;
      }

      return libraryElement;
    }));

    if (type !== "audio") {
      this.data[type] = _.union(this.data[type], lib);
    }

    if (type === "audio" && (folderScanResult.isFinishedAll || (
        folderScanResult.content && folderScanResult.content.isFinishedAll))) {
      this.audioScanned = true;
    } else if (folderScanResult.isFinishedAll || (folderScanResult.content &&
        folderScanResult.content.isFinishedAll)) {
      this.videoScanned = true;
    }
  };

  /**
   * Retrieve and populate artist photo from lastfm
   *
   * @param {String} artist artist name
   */
  getArtistCover(artist) {
    var alreadyScanned = this.loadingCoverArtists[artist.artist] !==
      undefined;

    if (!alreadyScanned) {
      this.loadingCoverArtists[artist.artist] = "/static/img/artist.jpg";
      connector.getArtistInfo(artist).then(data => {
        this.loadingCoverArtists[artist.artist] = artist;
      }).catch(error => {
        console.warn("GetArtistInfo triggered an unexpected error on external apis: " + error);
      });
    }
  };

  /**
   * Retrieve and populate album cover from lastfm
   *
   * @param {String} artist artist name
   * @param {String} album album title
   */
  getAlbumCover(artist, album, location) {
    if (this.loadingCoverAlbums[artist.artist] === undefined) {
      this.loadingCoverAlbums[artist.artist] = {};
    }

    var alreadyScanned = this.loadingCoverAlbums[artist.artist][album.title] !==
      undefined;

    if (!alreadyScanned) {
      this.loadingCoverAlbums[artist.artist][album.title] =
        "/static/img/album.png";
      this.loadingCoversAlbumsFlatten[album.title] = "/static/img/album.png";
      album.cover = ['/static/img/album.png'];
      album.image = ['/static/img/album.png'];

      if (fs.existsSync(path.resolve(location, 'cover.jpg'))) {
        album.cover = [
          `/api/audio/static/covers/${artist.artist}/${album.title}/cover.jpg`
        ];
        album.image = [
          `/api/audio/static/covers/${artist.artist}/${album.title}/cover.jpg`
        ];
        this.loadingCoverAlbums[artist.artist][album.title] = album;
        this.loadingCoversAlbumsFlatten[album.title] = album;
        if (!this.coversLocation[artist.artist]) {
          this.coversLocation[artist.artist] = {};
        }
        this.coversLocation[artist.artist][album.title] = path.resolve(
          location,
          'cover.jpg');
      } else if (artist) {
        connector.getAlbumInfo(artist, album).then(data => {
          this.loadingCoverAlbums[artist.artist][album.title] = album;
          this.loadingCoversAlbumsFlatten[album.title] = album;
        }).catch(error => {
          console.warn("GetAlbumInfo triggerred unexpected error on external apis: " + error);
        });
      }
    }
  };

  getArtistImage(artist) {
    return this.loadingCoverArtists[artist].image ? this.loadingCoverArtists[artist].image[0] : null;
  }

  getCoverImage(artist, album) {
    return this.loadingCoverAlbums[artist][album].image[0];
  }

  getAlbumCoverByName(artist, album) {
    return this.coversLocation[artist] && this.coversLocation[artist][album] ?
      this.coversLocation[artist][album] : undefined;
  }

  /**
   * Check if library is scanning a folder.
   */
  scanning() {
    return this.scanProgress !== undefined ? this.scanProgress : false;
  };

  /**
   * Scan the library.
   *
   * @returns a promise
   */
  scan() {
    var that = this;
    this.scanProgress = true;
    this.videoScanned = true;
    this.audioScanned = false;
    // Clear all datas.
    this.data = {
      audio: [],
      video: []
    };
    this.loadingCoverAlbums = [];
    this.loadingCoverArtists = [];

    // Rescan full library.
    this.flatten = null;
    return new Promise((resolve) => {
      this.beginScan().then(() => {
        if (this.videoScanned && this.audioScanned) {
          library.getSharedFolders((err, folders) => {
            if (folders) {
              var foldersScanning = _.map(folders, (folder) => {
                return {
                  path: folder,
                  scanned: 0
                };
              });
              async.each(folders, (folder, next) => {
                var username = folder.split("[")[0];
                var folderObject = {
                  path: path.join(__dirname,
                    `../../../public/user/${username}/imported/${folder.replace(username + "[", "").slice(0, -1)}`
                  ),
                  username: folder.split("[")[0]
                };
                console.info(
                  `adding user shared folder: ${folderObject.path} ---> ${folderObject.username}`
                );
                this.addFolder(folderObject, (scanResults) => {
                  var scannedFolder = _.where(
                    foldersScanning, {
                      path: folder
                    });
                  scannedFolder.scanned += 1;

                  if (scannedFolder.scanned === 2) {
                    // Audio and video are scanned.
                    next();
                  }
                });
              }, () => {
                this.scanProgress = false;
                resolve();
              });
            } else {
              that.scanProgress = false;
              resolve();
            }
          });
        }
      });
    });
  };

  /**
   * Get relative path of audio file.
   *
   * @param {String} uuid unique file identifier
   */
  getRelativePath(uuid) {
    uuid = uuid.replace(".mp3", "");
    uuid = uuid.replace(".ogg", "");
    uuid = uuid.replace(".wav", "");
    var libElement = this.getByUid(uuid);
    return libElement.relativePath;
  };

  refreshMetadatas(uuid) {
    uuid = uuid.replace(".mp3", "");
    uuid = uuid.replace(".ogg", "");
    uuid = uuid.replace(".wav", "");
    var filePath = this.getRelativePath(uuid);

    return new Promise((resolve, reject) => {

      try {
        // Check if ffmetadata is best than mm
        ffmetadata.read(filePath, (err, metadataFFMPEG) => {
          console.debug(`libelement: ${filePath}`, err,
            metadataFFMPEG)
          if (err) {
            console.error(`libelement: ${filePath}`, err);
            return reject(err);
          }

          var parser = mm(fs.createReadStream(filePath), {
            duration: true
          }, (err, metadata) => {
            console.debug(`libelement: ${filePath}`, err,
              metadataFFMPEG)
            if (err) {
              console.error(`libelement: ${filePath}`, err);
              return reject(err);
            }

            var element = new Decoder("audio").song(filePath,
              metadataFFMPEG, metadata.duration);

            this.set(uuid, element);
            resolve(element);
          });
        });

      } catch (error) {
        reject(error);
      }
    });

    return libElement.relativePath;
  }

  /**
   * Get audio contents using some filters and render properties
   *
   * @param {*} page page number (starts from 0)
   * @param {*} lenght number of records
   * @param {*} groupby group by criterion
   * @param {*} sortby sort by criterion
   */
  getAudio(page, lenght, groupby, sortby) {
    var audios = this.search({
      filter: "",
      type: "audio"
    });


    if (groupby) {
      audios = this.search({
        filter: "",
        type: "audio",
        groupby: groupby,
        sortby: sortby
      });
    }
    audios = _.first(_.rest(audios, page * lenght), lenght);
    return audios;
  };

  getArtistDetails(name) {
    const tracks = _.filter(this.flatten, (element) => {
      if (element && element.artist && name) {
        return name.trim().toLowerCase() === element.artist.trim().toLowerCase();
      }
      return false;
    });
    const albums = this.groupby(tracks, ["album"]);
    const infos = this.loadingCoverArtists[name.trim()];
    return {
      name: name,
      info: infos,
      albums: albums
    };
  }

  getArtists(page, lenght, search, sort) {
    var artists;
    artists = _.sortBy(_.uniq(_.map(this.flatten, (track) => {
      return track.artist;
    })), (name) => {
      return name;
    });

    if (search) {
      artists = _.filter(artists, (name) => {
        if (name) {
          return name.trim().toLowerCase().match(
            `.*${search.toLowerCase()}.*`);
        }
        return false;
      });
    }

    artists = _.map(artists, (name) => {
      return {
        name: name,
        info: this.loadingCoverArtists[name]
      }
    });

    if (page) {
      artists = _.first(_.rest(artists, page * lenght), lenght);
    }
    // this.loadingCoverAlbums[val[0].artist]
    return artists;
  }

  getLibAlbums(page, lenght, search, asc) {
    var albums;
    albums = _.sortBy(_.uniq(_.map(this.flatten, (track) => {
      return {
        title: track.album,
        artist: track.artist
      };
    }), false, (element) => {
      return element.title;
    }), (element) => {
      return element.title;
    });

    if (search) {
      albums = _.filter(albums, (album) => {
        if (album && album.title) {
          let albumNameMatches = album.title.trim().toLowerCase().match(
            `.*${search.toLowerCase()}.*`);
          let artistNameMatches = album.artist.trim().toLowerCase().match(
            `.*${search.toLowerCase()}.*`);
          return albumNameMatches || artistNameMatches;
        }
        return false;
      });
    }

    albums = _.map(albums, (album) => {
      return {
        name: album.title,
        info: this.loadingCoversAlbumsFlatten[album.title]
      };
    });

    if (page) {
      albums = _.first(_.rest(albums, page * lenght), lenght);
    }
    return albums
  }

  /*
    getVideo () {
      return this.data.video;
    };
  */
  /**
   * Get video contents.
   *
   * @param {*} page page number (starts from 0)
   * @param {*} lenght number of records
   */
  getVideo(page, lenght) {
    return _.first(_.rest(this.data.video, page * lenght), lenght);
  };

  /**
   * Get audio file properties using unique identifier.
   *
   * @param {String} uuid unique file identifier
   */
  getByUid(uuid) {
    uuid = uuid.replace(".mp3", "");
    uuid = uuid.replace(".ogg", "");
    uuid = uuid.replace(".wav", "");

    return _.find(this.flatten, {
      uid: uuid
    });
  };

  /**
   * Set audio file properties using unique identifier.
   *
   * @param {String} uuid unique file identifier
   */
  set(uuid, libElement) {
    uuid = uuid.replace(".mp3", "");
    uuid = uuid.replace(".ogg", "");
    uuid = uuid.replace(".wav", "");
    console.info("Update: ", _.findIndex(this.flatten, {
      uid: uuid
    }));
    return this.flatten[_.findIndex(this.flatten, {
      uid: uuid
    })] = libElement;
  };

  /**
   * Get album cover of a track.
   *
   * @param {String} uuid unique file identifier
   */
  getAlbumArtImage(uuid) {
    uuid = uuid.replace(".mp3", "");
    uuid = uuid.replace(".ogg", "");
    uuid = uuid.replace(".wav", "");

    return this.loadingCoverAlbums[_.find(this.flatten, {
      uuid: uuid
    }).artist][_.find(this.flatten, {
      uuid: uuid
    }).album];
  };

  /**
   * Search through an array containing the library elements.
   *
   * @param {Object} opts search options
   * @param {Array} fromList list to filter (Optional)
   */
  search(opts, fromList) {
    var filter = opts.filter,
      type = opts.type,
      groupby = opts.groupby,
      sortby = opts.sortby;
    var searchResultList;

    if (filter.indexOf("~") === 0) {
      var filters = filter.substring(1, filter.length).split(" ");
      console.debug("Search into any of these values: ", filters);
      _.each(filters, (subFilter) => {
        if (searchResultList) {
          searchResultList = this.search({
            filter: subFilter,
            type: type,
            groupby: undefined
          }, searchResultList);
        } else {
          searchResultList = this.search({
            filter: subFilter,
            type: type,
            groupby: undefined
          });
        }
      });
      return this.groupby(searchResultList, groupby);
    }

    if (!fromList) {
      fromList = this.flatten;
      if (opts.user && this.flatten) {
        fromList = _.union(fromList, this.flatten[opts.user]);
      } else {
        fromList = _.filter(fromList, (track) => {
          return track.private === undefined || !track.private;
        });
      }
    }
    if (filter) {
      searchResultList = _.filter(fromList, (obj) => {
        var filterClause = ".*".concat(filter.latinize().toLowerCase().trim()
            .replace(/ /g, ".*")).concat(".*"),
          found = false;
        if (type === "video" && obj.type === type) {
          found = obj.name.toLowerCase().match(filterClause);
        } else if (type === "audio" && obj.type === type) {
          if (!obj.title) {
            console.error("error checking object: ", obj);
          }
          found = obj.title.toString().latinize().toLowerCase().match(
            filterClause);
          found = found ? found : obj.album.toString().latinize().toLowerCase()
            .match(filterClause);
          found = found ? found : obj.artist.toString().latinize().toLowerCase()
            .match(filterClause);

          if (!found) {
            _.each(obj.metadatas, (val, key) => {
              if (!found) {
                if (typeof val === 'String') {
                  if (val.latinize().toLowerCase().match(filterClause)) {
                    found = true;
                  }
                } else if (Array.isArray(val)) {
                  for (var value of val) {
                    if (value.toString().latinize().toLowerCase().match(
                        filterClause)) {
                      found = true
                      break;
                    }
                  }
                } else {
                  if (val === filterClause) {
                    found = true
                  }
                }
              }
            });
          }
        }
        return found;
      });
    } else {
      searchResultList = this.flatten;
    }
    var arrayResults = [];

    if (type === "audio" && groupby) {
      arrayResults = this.groupby(searchResultList, groupby, sortby);
    } else {
      arrayResults = searchResultList;
    }


    return arrayResults;
  };

  /**
   * Render library using a group by criterion.
   *
   * @param {Array} searchResultList library list elements.
   * @param {String | Array} groupbyClause group by criterion
   * @param {String} sortby sort by criterion
   */
  groupby(searchResultList, groupbyClause, sortby) {
    groupbyClause = groupbyClause ? groupbyClause : ['artist', 'album'];

    searchResultList = _.sortBy(searchResultList, sortby);

    var groupedResultList = _.groupByMulti(searchResultList, groupbyClause);

    var output = _.map(groupedResultList, (val, groupObject) => {
      var rootGroupObject = {};
      if (groupbyClause[0] === "artist") {
        rootGroupObject.artist_info = this.loadingCoverArtists[
          groupObject];
      } else if (groupbyClause[0] === "album" && this.loadingCoverAlbums[
          val[0].artist]) {
        rootGroupObject.album_info = this.loadingCoverAlbums[val[0].artist]
          [groupObject];
      }

      if (groupbyClause.length > 1) {
        rootGroupObject[groupbyClause[0]] = groupObject;

        var filteredTracks = _.map(val, (album, title) => {
          var albumObject = {
            title: title,
            tracks: _.map(album, (tracks, index) => {
              return tracks;
            })
          };

          if (groupbyClause[1] === "album" && this.loadingCoverAlbums[
              groupObject]) {
            albumObject.album_info = this.loadingCoverAlbums[
              groupObject][albumObject.title];
            if (!albumObject.album_info) {
              albumObject.album_info = {
                cover: '/static/img/album.png'
              };
            }
          } else if (groupbyClause[1] === "artist") {
            albumObject.album_info = this.loadingCoverArtists[
              albumObject.title];
          }

          albumObject.tracks = _.sortBy(albumObject.tracks, (element) => {
            if (element.metadatas && element.metadatas.track) {
              if (element.metadatas.track.no) {
                return parseInt(element.metadatas.track.no);
              } else {
                if (element.metadatas.track.indexOf('/')) {
                  return parseInt(element.metadatas.track.split(
                    '/')[
                    0]);
                }
                return parseInt(element.metadatas.track);
              }
            }
            return 0;
          });

          return albumObject;
        });

        if (groupbyClause[1] === "album") {
          rootGroupObject.albums = filteredTracks;
        } else {
          rootGroupObject[groupbyClause[1]] = filteredTracks;
        }

      } else {
        rootGroupObject[groupbyClause[0]] = groupObject;

        val = _.sortBy(val, (element) => {
          if (element.metadatas && element.metadatas.track) {
            if (element.metadatas.track.no) {
              return parseInt(element.metadatas.track.no);
            } else {
              if (element.metadatas.track.indexOf('/')) {
                return parseInt(element.metadatas.track.split('/')[0]);
              }
              return parseInt(element.metadatas.track);
            }
          }
          return 0;
        });
        rootGroupObject.tracks = val;
      }

      return rootGroupObject;
    });

    return output;
  };

  /**
   * Search through pages
   *
   * @param {Object} opts search options
   */
  searchPage(opts) {
    var that = this;
    return _.first(_.rest(that.search(opts), opts.page * opts.lenght), opts.lenght);
  };

  /**
   * Get user personal library.
   *
   * @param {Array} ids
   * @param {Number} page
   * @param {Number} length
   * @param {String} username
   * @param {Object} filter
   */
  getUserLibrary(ids, page, length, username, filter) {
    var searchResultList = _.filter(this.flatten, (obj) => {
      return _.contains(ids, obj.uid) || (obj.private && obj.user ===
        username);
    });

    if (filter) {
      searchResultList = this.search({
        filter: filter,
        type: 'audio'
      }, searchResultList);
    }

    searchResultList = _.groupByMulti(searchResultList, ['artist', 'album']);

    var arrayResults = [];
    arrayResults = _.map(searchResultList, (val, artist) => {
      var artistObject = {
        artist: artist,
        image: this.loadingCoverArtists[artist],
        albums: _.map(val, (album, title) => {
          var albumObject = {
            title: title,
            cover: artist && title && this.loadingCoverAlbums[
                artist] && this.loadingCoverAlbums[artist][title] ?
              this.loadingCoverAlbums[artist][title] : "/static/img/album.png",
            tracks: _.map(album, (tracks, index) => {
              return tracks;
            })
          };
          return albumObject;
        })
      };

      return artistObject;
    });
    if (page) {
      return _.first(_.rest(arrayResults, page * length), length);
    }
    return arrayResults;
  }

  /**
   * Get audio files properties using a list of unique file identifier.
   *
   * @param {Array} ids
   * @param {Number} page
   * @param {Number} length
   * @param {String} username
   * @param {Object} filter
   */
  getAudioById(ids, page, length, username, filter) {
    var searchResultList = _.filter(this.flatten, (obj) => {
      return _.contains(ids, obj.uid);
    });

    searchResultList = _.groupByMulti(searchResultList, ['artist', 'album']);

    var arrayResults = [];
    arrayResults = _.map(searchResultList, (val, artist) => {
      var artistObject = {
        artist: artist,
        image: this.loadingCoverArtists[artist],
        albums: _.map(val, (album, title) => {
          var albumObject = {
            title: title,
            cover: this.loadingCoverAlbums[artist][title] ? this.loadingCoverAlbums[
              artist][title] : "/static/img/album.png",
            tracks: _.map(album, (tracks, index) => {
              return tracks;
            })
          };
          return albumObject;
        })
      };

      return artistObject;
    });
    if (page) {
      return _.first(_.rest(arrayResults, page * length), length);
    }
    return arrayResults;
  };

  /**
   * Get all albums of an artist
   *
   * @param {String} artist artist name
   */
  getAlbums(artist) {
    return this.getAlbum(artist);
  };

  /**
   * Get a specific album tracks.
   *
   * @param {String} artist artist name
   * @param {String} album album title
   */
  getAlbum(artist, album) {
    var arrayResults;
    if (artist === "all") {
      arrayResults = this.groupby(this.flatten, ["album"]);
      arrayResults = _.where(arrayResults, {
        album: album
      });
      const artists = [];
      _.each(arrayResults, (album) => {
        artists.push(album.album_info.artist);
      });
      var albumsObject = [];
      _.each(arrayResults, (album) => {
        albumsObject.push({
          artists: artists,
          albums: arrayResults,
        });
      });
      return albumsObject;
    } else {
      arrayResults = this.groupby(this.flatten);
      arrayResults = _.where(arrayResults, {
        artist: artist
      });
      var albumSearched;
      _.each(arrayResults[0].albums, (albumObj, index) => {
        if (albumObj.title === album) {
          albumSearched = albumObj;
        }
      });
      arrayResults.albums = albumSearched;
    }
    return arrayResults;
  };

  /**
   * Get file path.
   *
   * @param {String} uid unique file identifier
   */
  getFile(uid) {
    return this.getRelativePath(uid);
  };

  /**
   * Get audio files in flatten representation.
   *
   * @param {Array} ids unique file identifier
   */
  getAudioFlattenById(ids) {
    var searchResultList = _.filter(this.flatten, (obj) => {
      return _.contains(ids, obj.uid);
    });
    return searchResultList;
  };

  count(criterion) {
    if (!criterion || criterion === 'tracks') {
      return this.flatten.length;
    } else {
      return _.keys(this.groupby(this.flatten, [criterion])).length;
    }
  }

  usage() {
    return new Promise((resolve, reject) => {
      if (Array.isArray(nconf.get("library"))) {
        var folders = nconf.get("library");
        return new Promise((resolve, reject) => {
          async.reduce(folders, 0, (currentSize, folder, next) => {
            getSize(folder, (err, size) => {
              if (err) {
                throw err;
              }
              next(null, currentSize + size);
            });
          }, function(error, ret) {
            if (error) {
              return reject(error);
            }
            resolve(ret);
          });
        });
      } else {
        var folder = nconf.get("library");
        getSize(folder, (err, size) => {
          if (err) {
            throw err;
          }
          resolve(size);
        });
      }
    });
  }
}

module.exports = new Library();
