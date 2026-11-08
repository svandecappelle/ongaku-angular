import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';

/** Waveforms kept in memory (400 small numbers each) */
const KEPT = 100;

/** Waveforms of the tracks (GET /api/audio/peaks/:uid): 400 values from 0 to 255, null when unreadable */
@Injectable({ providedIn: 'root' })
export class PeaksService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<number[] | null>>();

  get(uid: string): Observable<number[] | null> {
    let peaks = this.cache.get(uid);
    if (peaks) {
      // Most recently used last
      this.cache.delete(uid);
    } else {
      peaks = this.http.get<{ peaks: number[] }>(`/api/audio/peaks/${encodeURIComponent(uid)}`).pipe(
        map((answer) => (Array.isArray(answer?.peaks) && answer.peaks.length ? answer.peaks : null)),
        catchError(() => of(null)),
        // A failure is asked again next time (the track may be read later, after a scan)
        tap((answer) => answer === null && this.cache.delete(uid)),
        shareReplay(1),
      );
    }
    this.cache.set(uid, peaks);
    while (this.cache.size > KEPT) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return peaks;
  }
}
