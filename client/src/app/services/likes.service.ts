import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { Song } from '../app-state';

/** A liked track, with the time of the like (ms) */
export type LikedSong = Song & { likedAt: number };

/**
 * Tracks the connected user liked (server/app/routes/api/likes.js). The uids
 * are loaded once and updated optimistically by like and unlike.
 */
@Injectable({ providedIn: 'root' })
export class LikesService {
  private readonly http = inject(HttpClient);
  private readonly uids = signal<ReadonlySet<string>>(new Set());
  private loaded = false;

  /** Version of the likes, changed by every like or unlike */
  readonly version = signal(0);

  has(track: Song): boolean {
    this.load();
    return this.uids().has(String(track.uid));
  }

  list(): Observable<{ tracks: LikedSong[]; missing: number }> {
    return this.http.get<{ tracks: LikedSong[]; missing: number }>('/api/likes');
  }

  like(tracks: Song[]): Observable<unknown> {
    return this.change('add', tracks);
  }

  unlike(tracks: Song[]): Observable<unknown> {
    return this.change('remove', tracks);
  }

  private change(action: 'add' | 'remove', tracks: Song[]): Observable<unknown> {
    const uids = tracks.map((track) => String(track.uid));
    const previous = this.uids();
    const next = new Set(previous);
    uids.forEach((uid) => (action === 'add' ? next.add(uid) : next.delete(uid)));
    this.uids.set(next);
    this.version.update((version) => version + 1);
    return this.http.post(`/api/likes/${action}`, { elements: uids }).pipe(
      tap({ error: () => this.uids.set(previous) }),
    );
  }

  private load() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    this.http.get<string[]>('/api/likes/uids').subscribe({
      next: (uids) => this.uids.set(new Set(uids)),
      // Not connected: nothing is liked, a later call retries
      error: () => (this.loaded = false),
    });
  }
}
