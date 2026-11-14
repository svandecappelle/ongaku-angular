const scan = require("./scanner");
const _ = require("underscore");
const logger = require("log4js").getLogger('Library');
const nconf = require("nconf");
const path = require("path");
const fs = require("fs");
const async = require("async");
const getFolderSize = require('get-folder-size').default;
const crypto = require("crypto");

// Images chosen by the administrators, kept with the downloaded artist covers (a Docker volume)
const CUSTOM_COVERS_DIRECTORY = path.resolve(__dirname, '../../../public/artists-covers/custom');
const getSize = (folder, callback) => getFolderSize.strict(folder).then((size) => callback(null, size), callback);
const connector = require("./connectors");
const { deduplicate } = require("./deduplicate");
const searchText = require("./search-text");

/** Tags searched besides the title, the artist and the album (not the lyrics nor the comments) */
const SEARCHED_TAGS = ['album_artist', 'albumartist', 'ALBUMARTIST', 'album_origin', 'genre', 'GENRE', 'composer', 'COMPOSER', 'performer', 'artists', 'date', 'year'];
/** The searched text of each track, prepared once (the tracks are new objects after a scan) */
const searchIndex = new WeakMap();

function trackFields(track) {
  const tags = track.metadatas || {};
  return [
    { value: track.title, weight: 4 },
    { value: track.artist, weight: 3 },
    { value: track.album, weight: 2 },
    { value: SEARCHED_TAGS.map((tag) => tags[tag]).flat(), weight: 1 },
  ];
}

function preparedTrack(track) {
  let prepared = searchIndex.get(track);
  if (!prepared) {
    prepared = searchText.prepare(trackFields(track));
    searchIndex.set(track, prepared);
  }
  return prepared;
}

var library;
try {
  library = require("../model/library");
} catch (err) {
  console.error(err);
}

const ffmetadata = require("ffmetadata");
const mm = require('music-metadata');
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
    // Every scanned track; `flatten` is the deduplicated view used by the listings
    this.tracks = [];
    this.deduplication = null;

    this.audioScanned = false;
    this.videoScanned = false;
    this.scanProgress = false;

    this.loadingCoverAlbums = [];
    this.loadingCoverArtists = [];
    this.loadingCoversAlbumsFlatten = [];

    this.coversLocation = [];
    scan.on('decoded', (song, type) => {
      console.debug("decoded", song, type);
      // The videos have their own list (see populate), never among the tracks
      if (type !== 'audio') {
        return;
      }
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
        this.setTracks(_.union(this.tracks, tracks));

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
      }
      if (folderContent.video) {
        that.populate("video", {
          folder: folder,
          content: folderContent
        }, folder);
      }
      callback({
        type: folderContent.audio && folderContent.audio.length ? 'audio' : 'video'
      });
    })
  };

  /**
   * Remove folder from scanned library folders
   *
   * @param {String} folder remove the folder from scanned library folders
   */
  removeFolder(folder) {
    scan.removeToScan(folder.path);
    const inFolder = (entry) => entry.username && entry.username === folder.username && folder.path === entry.userfolder;
    this.setTracks(_.reject(this.tracks, inFolder));
    this.data.video = _.reject(this.data.video, inFolder);
  }

  /**
   * Populate library with scanned elements.
   *
   * @param {String} type type of media: audio | video
   * @param {Object} folderScanResult object of all scanned results
   * @param {Object} folder folder path and state
   */
  populate(type, folderScanResult, folder) {
    if (type === 'video') {
      return this.populateVideos(folderScanResult, folder);
    }
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

    this.setTracks(_.union(this.tracks, _.map(_.groupBy(lib, 'uid'), (track,
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
    })));

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

  /** Adds scanned videos (see video.js): a video found again replaces its former entry */
  populateVideos(folderScanResult, folder) {
    const scanned = folderScanResult.content ? folderScanResult.content.video : folderScanResult.video;
    const owner = folderScanResult.folder || null;
    const videos = _.compact(scanned || []).map((video) => {
      const entry = Object.assign({}, video, {
        private: !!(owner && owner.private),
        user: owner ? owner.username || null : null,
      });
      if (folder && folder.username) {
        entry.username = folder.username;
        entry.userfolder = folder.path;
        // Uploads live outside the music folders, in "imported" of the account folder: their
        // folder is told from the uploads
        const sub = path.relative(folder.path, path.dirname(video.file)).split(path.sep).join('/').replace(/^imported(\/|$)/, '');
        entry.folder = sub && !sub.startsWith('..') ? `My uploads/${sub}` : 'My uploads';
      }
      return entry;
    });
    const byUid = new Map((this.data.video || []).map((video) => [video.uid, video]));
    videos.forEach((video) => byUid.set(video.uid, video));
    this.data.video = [...byUid.values()];
    if (folderScanResult.isFinishedAll || (folderScanResult.content && folderScanResult.content.isFinishedAll)) {
      this.videoScanned = true;
    }
  }

  /** The videos a member can watch: the library ones, and the private ones of this member */
  videosFor(username) {
    return (this.data.video || []).filter((video) => !video.private || (username && video.user === username));
  }

  /** A video by its uid, if this member can watch it */
  getVideo(uid, username) {
    return this.videosFor(username).find((video) => video.uid === String(uid)) || null;
  }

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

    if (!alreadyScanned && fs.existsSync(this.customImagePath(artist.artist, album.title))) {
      this.applyCustomAlbumImage(artist.artist, album.title, album);
      return;
    }

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
    const info = this.loadingCoverArtists[artist];
    return info && info.image ? info.image[0] : null;
  }

  getCoverImage(artist, album) {
    const info = this.loadingCoverAlbums[artist] && this.loadingCoverAlbums[artist][album];
    return info && info.image ? info.image[0] : null;
  }

  /**
   * File of the image an administrator chose for an artist (no album) or an album.
   * Named after a hash: artist and album names may hold any character.
   */
  customImagePath(artist, album) {
    const key = album === undefined ? `artist\u0000${artist}` : `album\u0000${artist}\u0000${album}`;
    return path.join(CUSTOM_COVERS_DIRECTORY, crypto.createHash('sha1').update(key).digest('hex'));
  }

  albumCoverUrl(artist, album) {
    return `/api/audio/static/covers/${encodeURIComponent(artist)}/${encodeURIComponent(album)}/cover.jpg`;
  }

  /**
   * Point the album info at the custom image (served by the covers route). The version in the
   * URL changes with each new image, past the browser caches. The previous images are kept
   * to be restored by resetAlbumImage.
   */
  applyCustomAlbumImage(artist, album, info) {
    if (!this.loadingCoverAlbums[artist]) {
      this.loadingCoverAlbums[artist] = {};
    }
    const current = this.loadingCoverAlbums[artist][album];
    info = info || (current && typeof current === 'object' ? current : {});
    // Last.fm needs the title to look the album up again after a reset
    info.title = info.title || album;
    if (info.originalImages === undefined) {
      // Not enumerable: kept out of the API answers
      Object.defineProperty(info, 'originalImages', { value: { image: info.image, cover: info.cover }, writable: true, configurable: true });
    }
    const url = `${this.albumCoverUrl(artist, album)}?v=${Date.now()}`;
    info.image = [url];
    info.cover = [url];
    this.loadingCoverAlbums[artist][album] = info;
    this.loadingCoversAlbumsFlatten[album] = info;
  }

  /**
   * Back to the cover of the album folder, else the one of Last.fm.
   */
  resetAlbumImage(artist, album) {
    const info = this.loadingCoverAlbums[artist] && this.loadingCoverAlbums[artist][album];
    if (!info || typeof info !== 'object') {
      return;
    }
    const original = info.originalImages;
    delete info.originalImages;
    if (original && original.image && original.image[0] !== "/static/img/album.png") {
      info.image = original.image;
      info.cover = original.cover;
    } else if (this.getAlbumCoverByName(artist, album)) {
      info.image = [this.albumCoverUrl(artist, album)];
      info.cover = info.image;
    } else {
      // The custom image was there since the start: ask Last.fm now
      info.image = ["/static/img/album.png"];
      info.cover = info.image;
      connector.getAlbumInfo({ artist: artist }, info).catch((error) => {
        console.warn("GetAlbumInfo triggerred unexpected error on external apis: " + error);
      });
    }
  }

  /** The album exists in the scanned library */
  hasAlbum(artist, album) {
    return _.some(this.flatten, (track) => track.artist === artist && track.album === album);
  }

  hasArtist(artist) {
    return _.some(this.flatten, (track) => track.artist === artist);
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
    this.setTracks([]);
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

          mm.parseFile(filePath, {
            duration: true
          }).then((metadata) => {
            console.debug(`libelement: ${filePath}`, metadataFFMPEG)

            var element = new Decoder("audio").song(filePath,
              metadataFFMPEG, metadata.format.duration);

            this.set(uuid, element);
            resolve(element);
          }).catch((err) => {
            console.error(`libelement: ${filePath}`, err);
            reject(err);
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
      // The best matches first: "air" lists Air before Fair Weather
      artists = searchText.rank(_.compact(artists), search, (name) => [{ value: name, weight: 1 }]);
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

  /** Artist of the album of a track: its "album artist" tag (compilations), or its artist */
  albumArtistOf(track) {
    const tags = track.metadatas || {};
    let value = tags.album_artist || tags.albumartist || tags.ALBUMARTIST || tags.ALBUM_ARTIST || tags['ALBUM ARTIST'];
    value = Array.isArray(value) ? value[0] : value;
    value = value === undefined || value === null ? '' : String(value).trim();
    return value || track.artist;
  }

  /** Albums are told apart by their artist (case insensitive) and title: two artists may use the same title */
  albumKey(artist, album) {
    return String(artist || '').trim().toLowerCase() + '\u0000' + String(album);
  }

  /** Albums of the library: { title, artist, tracks } with `coverArtist`, the artist their cover is stored under */
  listAlbums() {
    const albums = new Map();
    this.flatten.forEach((track) => {
      const artist = this.albumArtistOf(track);
      const key = this.albumKey(artist, track.album);
      if (!albums.has(key)) {
        albums.set(key, { title: track.album, artist: artist, coverArtist: track.artist, tracks: [] });
      }
      albums.get(key).tracks.push(track);
    });
    return Array.from(albums.values());
  }

  albumInfo(album) {
    const byArtist = this.loadingCoverAlbums[album.coverArtist] && this.loadingCoverAlbums[album.coverArtist][album.title];
    return byArtist || this.loadingCoversAlbumsFlatten[album.title];
  }

  getLibAlbums(page, lenght, search, asc) {
    let albums = _.sortBy(this.listAlbums(), (album) => String(album.title).toLowerCase() + '\u0000' + String(album.artist).toLowerCase());

    if (search) {
      // The words in the title or the artist, in any order: "moon air" finds Moon Safari by Air
      albums = searchText.rank(albums.filter((album) => album && album.title), search,
        (album) => [{ value: album.title, weight: 2 }, { value: album.artist, weight: 1 }]);
    }

    albums = _.map(albums, (album) => {
      return {
        name: album.title,
        artist: album.artist,
        info: this.albumInfo(album)
      };
    });

    if (page) {
      albums = _.first(_.rest(albums, page * lenght), lenght);
    }
    return albums
  }

  /** Artists having an album of this title, for the links that only give the title */
  getAlbumArtists(album) {
    return this.listAlbums()
      .filter((entry) => entry.title === album)
      .map((entry) => ({ artist: entry.artist, tracks: entry.tracks.length, info: this.albumInfo(entry) }));
  }

  /**
   * An album, told apart by its artist: same shape as getAlbum('all', title), with the
   * artist of the album on the group. Empty when the artist has no album of this title.
   */
  getAlbumOf(artist, album) {
    const key = this.albumKey(artist, album);
    const entry = this.listAlbums().find((candidate) => this.albumKey(candidate.artist, candidate.title) === key);
    if (!entry) {
      return [];
    }
    const groups = this.groupby(entry.tracks, ['album']).map((group) => _.extend(group, {
      artist: entry.artist,
      // The cover is stored under the artist of a track (see getAlbumCover)
      coverArtist: entry.coverArtist,
      album_info: group.album_info || this.albumInfo(entry)
    }));
    return [{ artists: [entry.artist], albums: groups }];
  }

  /** Tracks of the library, each available music once (see deduplicate.js) */
  get flatten() {
    return this.getDeduplication().visible;
  }

  setTracks(tracks) {
    this.tracks = tracks || [];
    this.deduplication = null;
  }

  /** Duplicates of the library, computed again after every change */
  getDeduplication() {
    if (!this.deduplication) {
      const enabled = String(nconf.get('deduplicate')) !== 'false';
      this.deduplication = enabled ? deduplicate(this.tracks) : { visible: this.tracks, canonical: new Map(), groups: [] };
    }
    return this.deduplication;
  }

  // ---------- Changes of single files (see library-watcher.js) ----------

  /** The track of a file of the music folders, if listed */
  trackByFile(file) {
    return _.find(this.tracks, (track) => track.file === file);
  }

  /**
   * Adds a decoded track, or replaces the one of the same file (its tags changed). Its artist
   * and album images are looked for. Resolves with 'added' or 'updated'.
   */
  upsertTrack(song) {
    if (this.getByUid(song.uid)) {
      this.set(song.uid, song);
      return 'updated';
    }
    const track = _.extend(song, { uuid: song.uid, type: 'audio', private: false, user: null });
    track.metadatas = track.metadatas || {};
    this.setTracks(this.tracks.concat([track]));
    this.getArtistCover({ artist: track.artist });
    this.getAlbumCover({ artist: track.artist }, { title: track.album }, path.dirname(track.file));
    return 'added';
  }

  /** Takes out the tracks and videos of the files of a folder, sub folders included */
  removeUnder(folder) {
    const inside = (entry) => entry.file === folder || String(entry.file).startsWith(folder + path.sep);
    const tracks = this.tracks.filter(inside);
    const videos = (this.data.video || []).filter(inside);
    if (tracks.length) {
      this.setTracks(_.reject(this.tracks, inside));
    }
    if (videos.length) {
      this.data.video = _.reject(this.data.video, inside);
    }
    return { tracks, videos };
  }

  /** Adds a video of the music folders, or replaces the one of the same file */
  upsertVideo(video) {
    const videos = this.data.video || [];
    const index = videos.findIndex((entry) => entry.uid === video.uid);
    const entry = Object.assign({}, video, { private: false, user: null });
    if (index >= 0) {
      videos[index] = entry;
      return 'updated';
    }
    this.data.video = videos.concat([entry]);
    return 'added';
  }

  /** The cover.jpg of an album folder was added or removed: the image of its albums is looked for again */
  refreshFolderCover(folder) {
    const albums = new Map();
    this.tracks.filter((track) => path.dirname(track.file) === folder)
      .forEach((track) => albums.set(`${track.artist}\u0000${track.album}`, track));
    albums.forEach((track) => {
      if (this.loadingCoverAlbums[track.artist]) {
        delete this.loadingCoverAlbums[track.artist][track.album];
      }
      if (this.coversLocation[track.artist]) {
        delete this.coversLocation[track.artist][track.album];
      }
      delete this.loadingCoversAlbumsFlatten[track.album];
      this.getAlbumCover({ artist: track.artist }, { title: track.album }, folder);
    });
    return albums.size;
  }

  /** Takes a track out of the library (its file was deleted); a hidden copy of it shows up instead */
  removeTrack(uid) {
    this.setTracks(_.filter(this.tracks, (track) => track.uid !== uid));
  }

  /** The album has an image: chosen by an administrator, in its folder or found on Last.fm */
  hasAlbumCover(artist, album) {
    if (fs.existsSync(this.customImagePath(artist, album))) {
      return true;
    }
    if (this.coversLocation[artist] && this.coversLocation[artist][album]) {
      return true;
    }
    const info = this.loadingCoverAlbums[artist] && this.loadingCoverAlbums[artist][album];
    const image = info && typeof info === 'object' ? (info.image && info.image[0]) || (info.cover && info.cover[0]) : null;
    return typeof image === 'string' && image.trim() !== '' && !image.endsWith('/static/img/album.png');
  }

  /**
   * The library as a user sees it: public tracks and his own private uploads. The listing
   * methods called on it (getArtists, getAlbum...) only see these tracks.
   */
  forUser(username) {
    const tracks = this.flatten.filter((track) => !track.private || (username && track.user === username));
    return Object.create(this, { flatten: { value: tracks } });
  }

  /** After the "deduplicate" setting changed */
  refreshDeduplication() {
    this.deduplication = null;
  }

  /** Uid of the copy shown for a track uid (itself when it is not a hidden duplicate) */
  canonicalUid(uid) {
    return this.getDeduplication().canonical.get(uid) || uid;
  }

  canonicalUids(uids) {
    return new Set((uids || []).map((uid) => this.canonicalUid(uid)));
  }

  /** Track shown for a uid: the kept copy of a hidden duplicate */
  getVisibleByUid(uid) {
    return this.getByUid(this.canonicalUid(String(uid)));
  }

  /**
   * Get audio file properties using unique identifier.
   *
   * @param {String} uuid unique file identifier
   */
  getByUid(uuid) {
    uuid = uuid.replace(".mp3", "");
    uuid = uuid.replace(".ogg", "");
    uuid = uuid.replace(".wav", "");

    // Hidden duplicates included: their uids may be saved in libraries and playlists
    return _.find(this.tracks, {
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
    const index = _.findIndex(this.tracks, {
      uid: uuid
    });
    console.info("Update: ", index);
    if (index < 0) {
      return libElement;
    }
    // A decoded file only has its tags: where it comes from (private upload, owner) is kept
    const previous = this.tracks[index];
    _.extend(libElement, _.pick(previous, 'uuid', 'type', 'private', 'user', 'username', 'userfolder'));
    libElement.metadatas = libElement.metadatas || {};
    if (previous.metadatas && previous.metadatas.sharedBy) {
      libElement.metadatas.sharedBy = previous.metadatas.sharedBy;
    }
    // The tags may have changed: the duplicates are searched again
    this.deduplication = null;
    this.tracks[index] = libElement;
    // A new artist or album: its images are looked for
    this.getArtistCover({ artist: libElement.artist });
    this.getAlbumCover({ artist: libElement.artist }, { title: libElement.album }, path.dirname(libElement.file));
    return libElement;
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

    const track = this.getByUid(uuid);
    return track && this.loadingCoverAlbums[track.artist] ? this.loadingCoverAlbums[track.artist][track.album] : undefined;
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

    if (!fromList) {
      // Public tracks, and the private uploads of the user himself
      fromList = _.filter(this.flatten, (track) => {
        return !track.private || (opts.user && track.user === opts.user);
      });
    }
    if (filter && searchText.isSearch(filter)) {
      // Every word somewhere in the track, the most relevant first (see search-text.js)
      const search = searchText.parse(filter);
      searchResultList = _.filter(fromList, (obj) => obj.type === type || (!obj.type && type === 'audio'))
        .map((obj, index) => ({ obj, index, score: type === 'video' ? searchText.score(searchText.prepare([{ value: obj.name, weight: 1 }]), search) : searchText.score(preparedTrack(obj), search) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.obj);
      // Grouped results keep the order of the groups; a sort only reorders inside them
      if (type === "audio" && groupby) {
        return this.groupby(searchResultList, groupby, sortby);
      }
      return searchResultList;
    }
    // No search: the tracks the user may see (not the private uploads of the others)
    searchResultList = filter ? [] : fromList;
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
    const wanted = this.canonicalUids(ids);
    var searchResultList = _.filter(this.flatten, (obj) => {
      return wanted.has(obj.uid) || (obj.private && obj.user ===
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
    const wanted = this.canonicalUids(ids);
    var searchResultList = _.filter(this.flatten, (obj) => {
      return wanted.has(obj.uid);
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
    const wanted = this.canonicalUids(ids);
    var searchResultList = _.filter(this.flatten, (obj) => {
      return wanted.has(obj.uid);
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
        async.reduce(folders, 0, (currentSize, folder, next) => {
          getSize(folder, (err, size) => {
            if (err) {
              return next(err);
            }
            next(null, currentSize + size);
          });
        }, function(error, ret) {
          if (error) {
            return reject(error);
          }
          resolve(ret);
        });
      } else {
        var folder = nconf.get("library");
        getSize(folder, (err, size) => {
          if (err) {
            return reject(err);
          }
          resolve(size);
        });
      }
    });
  }
}

module.exports = new Library();
