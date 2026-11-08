import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay, tap } from 'rxjs/operators';

/** Lyrics of a track (server/app/routes/api/lyrics.js); lrc is null when there are none */
export interface TrackLyrics {
  /** custom: saved by an administrator; file: .lrc next to the track; tags: in the file */
  source: 'custom' | 'file' | 'tags' | null;
  lrc: string | null;
}

const NONE: TrackLyrics = { source: null, lrc: null };

/** Lyrics of the tracks, kept once loaded */
@Injectable({ providedIn: 'root' })
export class LyricsService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<TrackLyrics>>();
  /** Changed by every save or removal, to show the new lyrics */
  readonly version = signal(0);

  get(uid: string): Observable<TrackLyrics> {
    let lyrics = this.cache.get(uid);
    if (!lyrics) {
      lyrics = this.http.get<TrackLyrics>(`/api/lyrics/${encodeURIComponent(uid)}`).pipe(
        catchError(() => of(NONE)),
        shareReplay(1),
      );
      this.cache.set(uid, lyrics);
    }
    return lyrics;
  }

  /** Without the cache, for the editor */
  fetch(uid: string): Observable<TrackLyrics> {
    return this.http.get<TrackLyrics>(`/api/lyrics/${encodeURIComponent(uid)}`);
  }

  save(uid: string, lrc: string): Observable<TrackLyrics> {
    return this.http.put<TrackLyrics>(`/api/lyrics/${encodeURIComponent(uid)}`, { lrc }).pipe(tap((lyrics) => this.update(uid, lyrics)));
  }

  remove(uid: string): Observable<TrackLyrics> {
    return this.http.delete<TrackLyrics>(`/api/lyrics/${encodeURIComponent(uid)}`).pipe(tap((lyrics) => this.update(uid, lyrics)));
  }

  private update(uid: string, lyrics: TrackLyrics) {
    // The lyrics are shared by the copies of the track: they are read again
    this.cache.clear();
    this.cache.set(uid, of(lyrics));
    this.version.update((version) => version + 1);
  }
}
