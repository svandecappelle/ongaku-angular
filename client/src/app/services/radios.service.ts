import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { PlaybackService, RadioStation } from './playback.service';

/** What a test of a stream address finds (POST /api/radios/test) */
export interface StreamTest {
  url: string;
  type: string;
  name: string | null;
  genre: string | null;
  bitrate: number | null;
  title: string | null;
}

export interface StationFields {
  name: string;
  url: string;
  genre: string | null;
}

/** First title asked soon after the start: the station sends it with its first audio */
const FIRST_TITLE_DELAY = 3000;
const TITLE_INTERVAL = 15000;

/**
 * Internet radio stations (server/app/routes/api/radios.js), and the title on air of the
 * station playing, asked to the server every 15 seconds while it plays.
 */
@Injectable({ providedIn: 'root' })
export class RadiosService {
  private readonly http = inject(HttpClient);
  private readonly playback = inject(PlaybackService);

  /** Title sent by the station playing, null when none is known */
  readonly onAir = signal<string | null>(null);

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const station = this.playback.station();
      const playing = this.playback.playing();
      clearTimeout(timer);
      if (!station) {
        untracked(() => this.onAir.set(null));
        return;
      }
      if (!playing) {
        return;
      }
      const ask = (delay: number) => {
        timer = setTimeout(() => {
          this.http.get<{ title: string | null }>(`/api/radios/${encodeURIComponent(station.id)}/now`).subscribe({
            next: (answer) => this.playback.station()?.id === station.id && this.onAir.set(answer.title),
            error: () => undefined,
          });
          ask(TITLE_INTERVAL);
        }, delay);
      };
      untracked(() => this.onAir.set(station.nowPlaying));
      ask(FIRST_TITLE_DELAY);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  list(): Observable<{ administrator: boolean; stations: RadioStation[] }> {
    return this.http.get<{ administrator: boolean; stations: RadioStation[] }>('/api/radios');
  }

  test(url: string): Observable<StreamTest> {
    return this.http.post<StreamTest>('/api/radios/test', { url });
  }

  add(fields: StationFields): Observable<RadioStation> {
    return this.http.post<RadioStation>('/api/radios', fields);
  }

  update(id: string, fields: StationFields): Observable<RadioStation> {
    return this.http.put<RadioStation>(`/api/radios/${encodeURIComponent(id)}`, fields);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`/api/radios/${encodeURIComponent(id)}`);
  }

  setFavourite(id: string, favourite: boolean): Observable<{ favourite: boolean }> {
    return this.http.put<{ favourite: boolean }>(`/api/radios/${encodeURIComponent(id)}/favourite`, { favourite });
  }
}
