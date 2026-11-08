import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface DeleteResult {
  /** Uids of the deleted tracks, copies of the same music included */
  deleted: string[];
  failed: { uid: string; title?: string; message: string }[];
}

/** Deletion of track files (server/app/routes/api/tracks.js) */
@Injectable({ providedIn: 'root' })
export class TracksService {
  private readonly http = inject(HttpClient);

  /** Tracks deleted since the page was loaded: the lists hide them */
  readonly deleted = signal<ReadonlySet<string>>(new Set());

  delete(uids: string[]): Observable<DeleteResult> {
    return this.http.post<DeleteResult>('/api/tracks/delete', { uids }).pipe(
      tap((result) => {
        if (result.deleted.length) {
          this.deleted.update((deleted) => new Set([...deleted, ...result.deleted]));
        }
      }),
    );
  }
}
