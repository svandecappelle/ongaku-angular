import { Song } from '../app-state';
import { trackYear } from './track-list/tracks';

// Readers for the answers of the library API (server/app/middleware/library.js)

export interface AlbumView {
  title: string;
  /** Artist of the album ("album artist" tag for compilations) */
  artist: string;
  /** Artist the cover is stored under (the artist of a track) */
  coverArtist: string;
  cover: string | null;
  year: string | null;
  tracks: Song[];
  /** Raw answer of the API, given to the metadata dialog */
  details: any;
}

export interface AlbumSummary {
  title: string;
  /** Artist of the album, for its link */
  artist: string;
  cover: string | null;
  year: string | null;
  tracks: Song[];
}

export interface ArtistView {
  name: string;
  /** Candidate images, tried in order */
  images: string[];
  tags: string[];
  biography: string | null;
  albums: AlbumSummary[];
  tracks: Song[];
  /** Raw answer of the API, given to the metadata dialog */
  details: any;
}

/** Item of /api/audio/albums/:page */
export interface AlbumItem {
  name: string;
  artist: string;
  cover: string | null;
}

/** Item of /api/audio/artists/:page */
export interface ArtistItem {
  name: string;
  /** Candidate images, tried in order */
  images: string[];
}

/**
 * Artist of the album of a track: its "album artist" tag (compilations), or its artist.
 * Same rule as the server (Library.albumArtistOf): albums are told apart by it and their title.
 */
export function albumArtistOf(track: Song): string {
  const tags = (track.metadatas ?? {}) as Record<string, unknown>;
  let value = tags['album_artist'] ?? tags['albumartist'] ?? tags['ALBUMARTIST'] ?? tags['ALBUM_ARTIST'] ?? tags['ALBUM ARTIST'];
  value = Array.isArray(value) ? value[0] : value;
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text || String(track.artist ?? '');
}

/** Link to the page of the album of a track */
export function albumLink(track: Song): string[] {
  return ['/album', albumArtistOf(track), String(track.album ?? '')];
}

/**
 * The URL when it is a real image. The server puts placeholder paths in its data when an
 * album or artist has no image: the pages show their own placeholder instead, which follows
 * the theme.
 */
export function realImage(url: unknown): string | null {
  return typeof url === 'string' && url.trim() !== '' && !/\/static\/img\/(album\.png|artist\.jpg)$/.test(url) ? url : null;
}

/** Cover of an album info (an object with images), a URL, a placeholder path or nothing */
export function coverOf(info: unknown): string | null {
  if (typeof info === 'string') {
    return realImage(info);
  }
  if (!info || typeof info !== 'object') {
    return null;
  }
  const { image, cover } = info as { image?: string[]; cover?: string[] };
  return realImage(image?.[0]) ?? realImage(cover?.[0]);
}

/** Images of an artist: the cover saved by the server, then the one of Last.fm */
export function artistImages(name: string, info: any): string[] {
  const lastFm = realImage(info?.image?.[0]);
  return [`/api/audio/static/covers/${encodeURIComponent(name)}/cover.jpg`, ...(lastFm ? [lastFm] : [])];
}

/** /api/audio/album/:artist/:album (Library.getAlbumOf) */
export function toAlbumView(name: string, details: any): AlbumView | null {
  const group = details?.[0]?.albums?.[0];
  if (!group?.tracks?.length) {
    return null;
  }
  const info = typeof group.album_info === 'object' && group.album_info ? group.album_info : {};
  const tracks: Song[] = group.tracks;
  const artist = group.artist ?? info.artist?.name ?? info.artist ?? tracks[0].artist;
  return {
    title: group.album ?? name,
    artist,
    coverArtist: group.coverArtist ?? String(tracks[0].artist ?? artist),
    cover: coverOf(info),
    year: trackYear(tracks[0]),
    tracks,
    details,
  };
}

/** /api/audio/artist/:name (Library.getArtistDetails) */
export function toArtistView(name: string, details: any): ArtistView | null {
  const albums: AlbumSummary[] = (details?.albums ?? [])
    .filter((group: any) => group?.tracks?.length)
    .map((group: any) => ({
      title: group.album ?? group.album_info?.title ?? 'Unknown album',
      artist: albumArtistOf(group.tracks[0]),
      cover: coverOf(group.album_info),
      year: trackYear(group.tracks[0]),
      tracks: group.tracks,
    }))
    // Most recent first, albums without a year last
    .sort((a: AlbumSummary, b: AlbumSummary) => (b.year ?? '').localeCompare(a.year ?? ''));
  if (!albums.length) {
    return null;
  }
  const info = details.info ?? {};
  const artistName = details.name ?? name;
  return {
    name: artistName,
    images: artistImages(artistName, info),
    tags: (info.tags?.tag ?? []).map((tag: any) => tag?.name).filter(Boolean).slice(0, 6),
    biography: info.wikipedia || info.bio?.content || info.bio?.summary || null,
    albums,
    tracks: albums.flatMap((album) => album.tracks),
    details,
  };
}

export function toAlbumItems(page: any): AlbumItem[] {
  return (Array.isArray(page) ? page : [])
    .filter((album) => album?.name)
    .map((album) => ({ name: album.name, artist: album.artist ?? '', cover: coverOf(album.info) }));
}

export function toArtistItems(page: any): ArtistItem[] {
  return (Array.isArray(page) ? page : [])
    .filter((artist) => artist?.name)
    .map((artist) => ({ name: artist.name, images: artistImages(artist.name, artist.info) }));
}
