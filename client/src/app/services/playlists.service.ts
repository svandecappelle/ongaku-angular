import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { Song } from '../app-state';

/** Item of /api/playlist */
export interface PlaylistSummary {
  name: string;
  count: number;
  /** Seconds */
  duration: number;
  /** Covers of the first albums, for the mosaic */
  covers: string[];
  /** Last change (ms), null for the playlists saved before it was recorded */
  updated: number | null;
}

/** /api/playlist/:name */
export interface Playlist extends PlaylistSummary {
  tracks: Song[];
  /** Saved tracks no longer in the library */
  missing: number;
  /** Answer of an append: tracks actually added (a track is in a playlist once) */
  added?: number;
}

/**
 * Playlists of the connected user (server/app/routes/api/playlist.js). The list
 * is loaded on first use and refreshed after every change, for the menus.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistsService {
  private readonly http = inject(HttpClient);
  private readonly list = signal<PlaylistSummary[]>([]);
  private loaded = false;

  /** Playlists, most recently changed first */
  playlists() {
    if (!this.loaded) {
      this.refresh();
    }
    return this.list();
  }

  refresh() {
    this.loaded = true;
    this.http.get<PlaylistSummary[]>('/api/playlist').subscribe({
      next: (list) => this.list.set(Array.isArray(list) ? list : []),
      // Not connected: a later call retries
      error: () => (this.loaded = false),
    });
  }

  all(): Observable<PlaylistSummary[]> {
    return this.http.get<PlaylistSummary[]>('/api/playlist').pipe(tap((list) => {
      this.loaded = true;
      this.list.set(list);
    }));
  }

  get(name: string): Observable<Playlist> {
    return this.http.get<Playlist>(this.url(name));
  }

  create(name: string, tracks: Song[] = []): Observable<Playlist> {
    return this.http.post<Playlist>('/api/playlist', { name, uids: this.uids(tracks) }).pipe(tap(() => this.refresh()));
  }

  add(name: string, tracks: Song[]): Observable<Playlist> {
    return this.http.post<Playlist>(`${this.url(name)}/tracks`, { uids: this.uids(tracks) }).pipe(tap(() => this.refresh()));
  }

  /** Replaces the tracks (removal, new order) */
  setTracks(name: string, tracks: Song[]): Observable<Playlist> {
    return this.http.put<Playlist>(this.url(name), { uids: this.uids(tracks) }).pipe(tap(() => this.refresh()));
  }

  rename(name: string, newName: string): Observable<Playlist> {
    return this.http.put<Playlist>(this.url(name), { name: newName }).pipe(tap(() => this.refresh()));
  }

  remove(name: string): Observable<unknown> {
    return this.http.delete(this.url(name)).pipe(tap(() => this.refresh()));
  }

  private url(name: string) {
    return `/api/playlist/${encodeURIComponent(name)}`;
  }

  private uids(tracks: Song[]): string[] {
    return tracks.map((track) => String(track.uid));
  }
}
