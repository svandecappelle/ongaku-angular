import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Song } from '../app-state';
import { AlbumItem, AlbumView, ArtistItem, ArtistView, coverOf, toAlbumItems, toAlbumView, toArtistItems, toArtistView } from './library';

/** Lists of the library API, as used by the Discover page (routes of server/app/routes/api/audio.js) */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly http = inject(HttpClient);

  /** Page sizes set by the server */
  static readonly ARTISTS_PAGE = 4;
  static readonly ALBUMS_PAGE = 4;
  static readonly TRACKS_PAGE = 10;

  artists(page: number, search: string): Observable<ArtistItem[]> {
    const url = search ? `/api/audio/artists/filter/${encodeURIComponent(search)}/${page}` : `/api/audio/artists/${page}`;
    return this.http.get(url).pipe(map(toArtistItems));
  }

  albums(page: number, search: string): Observable<AlbumItem[]> {
    const url = search ? `/api/audio/albums/filter/${encodeURIComponent(search)}/${page}` : `/api/audio/albums/${page}`;
    return this.http.get(url).pipe(map(toAlbumItems));
  }

  /** Tracks matching the search, or the most played ones without a search */
  tracks(page: number, search: string): Observable<Song[]> {
    if (search) {
      return this.http.get<Song[]>(`/api/audio/tracks/filter/${encodeURIComponent(search)}/${page}`)
        .pipe(map((tracks) => (Array.isArray(tracks) ? tracks : [])));
    }
    return this.http.get<any>(`/api/audio/featured/${page}`)
      .pipe(map((answer) => (Array.isArray(answer?.stats?.plays) ? answer.stats.plays : [])));
  }

  album(artist: string, name: string): Observable<AlbumView | null> {
    return this.http.get(`/api/audio/album/${encodeURIComponent(artist)}/${encodeURIComponent(name)}`)
      .pipe(map((details) => toAlbumView(name, details)));
  }

  /** Artists having an album of this title (links that only give the title) */
  albumArtists(name: string): Observable<{ artist: string; tracks: number; cover: string | null }[]> {
    return this.http.get<any[]>(`/api/audio/album-artists/${encodeURIComponent(name)}`).pipe(
      map((list) => (Array.isArray(list) ? list : []).map((item) => ({ artist: item.artist, tracks: item.tracks, cover: coverOf(item.info) }))),
    );
  }

  artist(name: string): Observable<ArtistView | null> {
    return this.http.get(`/api/audio/artist/${encodeURIComponent(name)}`).pipe(map((details) => toArtistView(name, details)));
  }
}
