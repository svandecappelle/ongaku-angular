import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { Song } from '../app-state';

/** Album of the user's library, with its tracks */
export interface LibraryAlbum {
  artist: string;
  title: string;
  cover: string | null;
  tracks: Song[];
}

/**
 * Tracks the connected user added to his library ("My library"). The uids are
 * loaded once and updated optimistically by add and remove.
 */
@Injectable({ providedIn: 'root' })
export class MyLibraryService {
  private readonly http = inject(HttpClient);
  private readonly uids = signal<ReadonlySet<string>>(new Set());
  private loaded = false;

  /** Version of the library, changed by every add or remove */
  readonly version = signal(0);

  has(track: Song): boolean {
    this.load();
    return this.uids().has(String(track.uid));
  }

  content(): Observable<{ albums: LibraryAlbum[]; uids: string[] }> {
    return this.http.get<{ albums: LibraryAlbum[]; uids: string[] }>('/api/user/library/content').pipe(
      tap((content) => {
        this.loaded = true;
        this.uids.set(new Set(content.uids));
      }),
    );
  }

  add(tracks: Song[]): Observable<unknown> {
    return this.change('add', tracks);
  }

  remove(tracks: Song[]): Observable<unknown> {
    return this.change('remove', tracks);
  }

  private change(action: 'add' | 'remove', tracks: Song[]): Observable<unknown> {
    const uids = tracks.map((track) => String(track.uid));
    const previous = this.uids();
    const next = new Set(previous);
    uids.forEach((uid) => (action === 'add' ? next.add(uid) : next.delete(uid)));
    this.uids.set(next);
    this.version.update((version) => version + 1);
    return this.http.post(`/api/user/library/${action}`, { elements: uids }).pipe(
      tap({ error: () => this.uids.set(previous) }),
    );
  }

  private load() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    this.http.get<string[]>('/api/user/library/uids').subscribe({
      next: (uids) => this.uids.set(new Set(uids)),
      // Not connected: nothing is in the library, a later call retries
      error: () => (this.loaded = false),
    });
  }
}
