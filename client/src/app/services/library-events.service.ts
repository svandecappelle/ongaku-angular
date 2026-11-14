import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

import { SocketService } from './socket.service';

/** What changed in the music folders (server/app/middleware/library-watcher.js) */
export interface LibraryChange {
  added: number;
  updated: number;
  removed: number;
  /** Videos added, changed or removed */
  videos: number;
  /** Album folders whose cover.jpg was added or removed */
  covers: number;
  unreadable: number;
  /** A few of the albums concerned */
  albums: { artist: string; album: string }[];
  at: number;
}

/**
 * Changes of the library made while the page is open (files added, changed or deleted in
 * the music folders): the pages showing it load it again.
 */
@Injectable({ providedIn: 'root' })
export class LibraryEventsService {
  /** Changes since the page was opened */
  readonly version = signal(0);
  readonly last = signal<LibraryChange | null>(null);
  private readonly version$ = toObservable(this.version);

  constructor() {
    const socket = inject(SocketService).socket;
    const listener = (change: LibraryChange) => {
      this.last.set(change);
      this.version.update((version) => version + 1);
    };
    socket.on('library:changed', listener);
    inject(DestroyRef).onDestroy(() => socket.off('library:changed', listener));
  }

  /**
   * `fetch()` now, with `loading` first, then again after each change of the library,
   * without `loading`: the page keeps what it shows until the new data comes.
   */
  reloading<T>(fetch: () => Observable<T>, loading: T): Observable<T> {
    return this.version$.pipe(switchMap((_, index) => (index === 0 ? fetch().pipe(startWith(loading)) : fetch())));
  }
}

/** A change told in a few words: "3 tracks added · 1 removed" */
export function describeChange(change: LibraryChange): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (change.added) {
    parts.push(`${plural(change.added, 'track')} added`);
  }
  if (change.updated) {
    parts.push(`${plural(change.updated, 'track')} updated`);
  }
  if (change.removed) {
    parts.push(`${plural(change.removed, 'track')} removed`);
  }
  if (change.videos) {
    parts.push(`${plural(change.videos, 'video')} changed`);
  }
  if (change.covers) {
    parts.push(`${plural(change.covers, 'album cover')} changed`);
  }
  if (change.unreadable) {
    parts.push(`${plural(change.unreadable, 'file')} could not be read`);
  }
  return parts.join(' · ');
}
