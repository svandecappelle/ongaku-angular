const moment = require('moment');

const library = require('./library');
const likes = require('../model/likes');
const history = require('../model/history');

/** Tracks sent at once; the player asks for more as it plays */
const BATCH = 10;
const ARTIST_STATIONS = 3;
const GENRE_STATIONS = 3;
/** Liked tracks not among this many recent plays are "not heard lately" */
const RECENT_PLAYS = 300;
const MIN_REDISCOVER = 5;
/** The last plays are not played again by a station */
const AVOID_LAST = 20;

const KINDS = ['mix', 'artist', 'genre', 'rediscover'];

function artistOf(track) {
  const artist = String((track && track.artist) || '').trim();
  return artist && artist !== 'undefined' ? artist : null;
}

/** The genres of a track, lower case ("Rock; Pop" and tag arrays split) */
function genresOf(track) {
  const tags = (track && track.metadatas) || {};
  const value = tags.genre !== undefined ? tags.genre : tags.GENRE;
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((item) => String(item || '').split(/[;,/]/))
    .map((genre) => genre.trim())
    .filter((genre) => genre && genre.toLowerCase() !== 'undefined')
    .map((genre) => genre.toLowerCase());
}

/** The genre as written the first time it is met (for display), by its lower case key */
function genreNames(tracks) {
  const names = new Map();
  tracks.forEach((track) => {
    const tags = track.metadatas || {};
    const value = tags.genre !== undefined ? tags.genre : tags.GENRE;
    (Array.isArray(value) ? value : [value]).flatMap((item) => String(item || '').split(/[;,/]/)).forEach((raw) => {
      const name = raw.trim();
      if (name && name.toLowerCase() !== 'undefined' && !names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), name);
      }
    });
  });
  return names;
}

function countBy(items) {
  const counts = new Map();
  items.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** What the stations of a user are made from: his tracks, likes, recent plays and top artists */
function context(username) {
  const tracks = library.forUser(username).flatten.filter((track) => track.uid);
  const visible = new Map(tracks.map((track) => [track.uid, track]));
  const month = moment().format('YYYY-MM');
  return Promise.all([
    new Promise((resolve, reject) => likes.get(username, (err, entries) => (err ? reject(err) : resolve(entries)))),
    new Promise((resolve, reject) => history.recent(username, RECENT_PLAYS, (err, plays) => (err ? reject(err) : resolve(plays)))),
    new Promise((resolve, reject) => history.topArtists(username, month, 10, (err, artists) => (err ? reject(err) : resolve(artists)))),
  ]).then(([likedEntries, plays, topArtists]) => {
    const show = (uid) => visible.get(library.canonicalUid(uid));
    const liked = new Map();
    likedEntries.forEach((entry) => {
      const track = show(entry.value);
      if (track && !liked.has(track.uid)) {
        liked.set(track.uid, entry.score);
      }
    });
    const played = new Set(plays.map((play) => (show(play.uid) || {}).uid).filter(Boolean));
    const lastPlayed = plays.slice(0, AVOID_LAST).map((play) => (show(play.uid) || {}).uid).filter(Boolean);
    const artists = new Set(tracks.map(artistOf).filter(Boolean));
    return {
      tracks,
      liked,
      played,
      lastPlayed: new Set(lastPlayed),
      topArtists: topArtists.map((entry) => entry.value).filter((artist) => artists.has(artist)),
    };
  });
}

/** Liked tracks not played lately, liked more than two weeks ago */
function forgotten(ctx) {
  const before = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return ctx.tracks.filter((track) => ctx.liked.has(track.uid) && ctx.liked.get(track.uid) < before && !ctx.played.has(track.uid));
}

/** The stations offered to a user, the mix first */
function stations(username) {
  return context(username).then((ctx) => {
    if (!ctx.tracks.length) {
      return [];
    }
    const list = [];
    const mixFrom = [];
    if (ctx.liked.size) {
      mixFrom.push(`${ctx.liked.size} liked track${ctx.liked.size === 1 ? '' : 's'}`);
    }
    if (ctx.topArtists.length) {
      mixFrom.push('what you play most');
    }
    list.push({
      kind: 'mix',
      seed: null,
      name: `Made for ${username}`,
      text: mixFrom.length ? `Your ${mixFrom.join(' and ')}, and music close to it.` : 'Your whole library, shuffled with care.',
      artists: [...new Set(ctx.topArtists.concat([...ctx.liked.keys()].map((uid) => artistOf(ctx.tracks.find((t) => t.uid === uid)))).filter(Boolean))].slice(0, 3),
    });

    const byArtist = countBy(ctx.tracks.map(artistOf).filter(Boolean));
    const artists = ctx.topArtists.length ? ctx.topArtists.slice(0, ARTIST_STATIONS) : byArtist.slice(0, ARTIST_STATIONS).map(([artist]) => artist);
    artists.forEach((artist) => list.push({
      kind: 'artist',
      seed: artist,
      name: artist,
      text: ctx.topArtists.includes(artist) ? 'You play it a lot this month.' : `${byArtist.find(([name]) => name === artist)[1]} tracks, and artists close to it.`,
    }));

    const names = genreNames(ctx.tracks);
    countBy(ctx.tracks.flatMap(genresOf)).slice(0, GENRE_STATIONS).forEach(([genre, count]) => list.push({
      kind: 'genre',
      seed: names.get(genre) || genre,
      name: names.get(genre) || genre,
      text: `${count} track${count === 1 ? '' : 's'} in the library.`,
    }));

    const old = forgotten(ctx);
    if (old.length >= MIN_REDISCOVER) {
      list.push({ kind: 'rediscover', seed: null, name: 'Not heard lately', text: `${old.length} tracks you liked but have not played for a while.` });
    }
    return list;
  });
}

/** Picks up to `count` items by weight, without putting one back */
function weightedPick(candidates, count) {
  const pool = candidates.slice();
  const picked = [];
  while (picked.length < count && pool.length) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    let index = pool.findIndex((item) => (roll -= item.weight) < 0);
    if (index < 0) {
      index = pool.length - 1;
    }
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/** Moves a track away when it has the same artist as the one before it, when possible */
function spreadArtists(items) {
  for (let i = 1; i < items.length; i++) {
    if (artistOf(items[i].track) === artistOf(items[i - 1].track)) {
      const swap = items.findIndex((item, j) => j > i && artistOf(item.track) !== artistOf(items[i - 1].track));
      if (swap > 0) {
        [items[i], items[swap]] = [items[swap], items[i]];
      }
    }
  }
  return items;
}

/** The candidates of a station, with a weight and a reason */
function candidates(ctx, kind, seed) {
  const add = (list, track, weight, reason) => list.push({ track, weight, reason });
  const list = [];
  if (kind === 'artist') {
    const genres = new Set(ctx.tracks.filter((track) => artistOf(track) === seed).flatMap(genresOf));
    ctx.tracks.forEach((track) => {
      if (artistOf(track) === seed) {
        add(list, track, 3, 'same artist');
      } else if (genresOf(track).some((genre) => genres.has(genre))) {
        add(list, track, ctx.liked.has(track.uid) ? 1.5 : 1, ctx.liked.has(track.uid) ? 'liked' : 'close to it');
      }
    });
  } else if (kind === 'genre') {
    const key = String(seed || '').toLowerCase();
    ctx.tracks.forEach((track) => {
      if (genresOf(track).includes(key)) {
        add(list, track, ctx.liked.has(track.uid) ? 2 : 1, ctx.liked.has(track.uid) ? 'liked' : 'same genre');
      }
    });
  } else if (kind === 'rediscover') {
    forgotten(ctx).forEach((track) => add(list, track, 1, 'not heard lately'));
  } else {
    const top = new Set(ctx.topArtists);
    const genres = new Set(ctx.tracks.filter((track) => ctx.liked.has(track.uid) || top.has(artistOf(track))).flatMap(genresOf));
    ctx.tracks.forEach((track) => {
      if (ctx.liked.has(track.uid)) {
        add(list, track, 3, 'liked');
      } else if (top.has(artistOf(track))) {
        add(list, track, 2, 'played often');
      } else if (genres.has(genresOf(track)[0])) {
        add(list, track, ctx.played.has(track.uid) ? 0.7 : 1, ctx.played.has(track.uid) ? 'close to what you like' : 'new to you');
      } else {
        add(list, track, 0.25, 'from your library');
      }
    });
  }
  return list;
}

/**
 * The next tracks of a station: up to 10, none of `exclude` (the tracks the station already
 * queued) nor of the last plays when there are enough others. Each track carries `reason`.
 */
function nextTracks(username, kind, seed, exclude) {
  return context(username).then((ctx) => {
    const excluded = new Set((exclude || []).map((uid) => library.canonicalUid(uid)));
    const all = candidates(ctx, kind, seed).filter((item) => !excluded.has(item.track.uid));
    const fresh = all.filter((item) => !ctx.lastPlayed.has(item.track.uid));
    const pool = fresh.length >= BATCH ? fresh : all;
    return spreadArtists(weightedPick(pool, BATCH)).map((item) => Object.assign({}, item.track, { reason: item.reason }));
  });
}

module.exports = { KINDS, stations, nextTracks, genresOf };
