import { Song } from '../app-state';
import { trackYear } from './track-list/tracks';

// Readers for the answers of the library API (server/app/middleware/library.js)

export interface AlbumView {
  title: string;
  artist: string;
  cover: string | null;
  year: string | null;
  tracks: Song[];
  /** Raw answer of the API, given to the metadata dialog */
  details: any;
}

export interface AlbumSummary {
  title: string;
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
  cover: string | null;
}

/** Item of /api/audio/artists/:page */
export interface ArtistItem {
  name: string;
  /** Candidate images, tried in order */
  images: string[];
}

/** Cover of an album info, which is an object with images, a placeholder path or nothing */
export function coverOf(info: unknown): string | null {
  if (!info || typeof info !== 'object') {
    return null;
  }
  const { image, cover } = info as { image?: string[]; cover?: string[] };
  return image?.[0] ?? cover?.[0] ?? null;
}

/** Images of an artist: the cover saved by the server, then the one of Last.fm */
export function artistImages(name: string, info: any): string[] {
  const lastFm = info?.image?.[0];
  return [`/api/audio/static/covers/${encodeURIComponent(name)}/cover.jpg`, ...(typeof lastFm === 'string' && lastFm ? [lastFm] : [])];
}

/** /api/audio/album/:name (Library.getAlbum) */
export function toAlbumView(name: string, details: any): AlbumView | null {
  const group = details?.[0]?.albums?.[0];
  if (!group?.tracks?.length) {
    return null;
  }
  const info = typeof group.album_info === 'object' && group.album_info ? group.album_info : {};
  const tracks: Song[] = group.tracks;
  return {
    title: group.album ?? name,
    artist: info.artist?.name ?? info.artist ?? tracks[0].artist,
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
    .map((album) => ({ name: album.name, cover: coverOf(album.info) }));
}

export function toArtistItems(page: any): ArtistItem[] {
  return (Array.isArray(page) ? page : [])
    .filter((artist) => artist?.name)
    .map((artist) => ({ name: artist.name, images: artistImages(artist.name, artist.info) }));
}
