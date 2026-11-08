import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Song } from '../app-state';
import { PlaybackService } from './playback.service';

export type LibraryStationKind = 'mix' | 'artist' | 'genre' | 'rediscover';

/** A station made from the library (GET /api/radios/library) */
export interface LibraryStation {
  kind: LibraryStationKind;
  /** The artist or the genre; null for the mix and "not heard lately" */
  seed: string | null;
  name: string;
  text: string;
  /** For the mix: a few of the artists it plays */
  artists?: string[];
}

/** A track of a station, with the reason it was picked */
export type RadioSong = Song & { reason?: string };

/** More tracks are asked when fewer than this are left after the current one */
const REFILL_BELOW = 3;

/**
 * Endless stations made from the library: the queue starts with a first batch of tracks,
 * and more are added as it plays. Playing anything else (an album, a track, a live station)
 * ends the station. Created by the shell.
 */
@Injectable({ providedIn: 'root' })
export class LibraryRadioService {
  private readonly http = inject(HttpClient);
  private readonly playback = inject(PlaybackService);

  /** The station playing, null when none */
  readonly active = signal<LibraryStation | null>(null);
  readonly starting = signal(false);
  /** The tracks the station queued, to tell its tracks from others and not send them again */
  private queued = new Set<string>();
  private refilling = false;

  constructor() {
    // Another track or a live station plays: the station ends
    effect(() => {
      const current = this.playback.current();
      const live = this.playback.station();
      if (untracked(() => this.active()) && (live || (current && !this.queued.has(String(current.uid))))) {
        untracked(() => this.stop());
      }
    });

    // Near the end of the queue: more tracks
    effect(() => {
      const station = this.active();
      const left = this.playback.upcoming().length;
      if (station && left < REFILL_BELOW && !this.refilling) {
        untracked(() => this.refill(station));
      }
    });
  }

  stations(): Observable<LibraryStation[]> {
    return this.http.get<{ stations: LibraryStation[] }>('/api/radios/library').pipe(map((answer) => answer.stations));
  }

  isActive(station: LibraryStation): boolean {
    const active = this.active();
    return !!active && active.kind === station.kind && active.seed === station.seed;
  }

  /** Replaces the queue with the first tracks of the station and plays them */
  start(station: LibraryStation): Observable<boolean> {
    this.starting.set(true);
    return this.next(station, []).pipe(map((tracks) => {
      this.starting.set(false);
      if (!tracks.length) {
        return false;
      }
      this.queued = new Set(tracks.map((track) => String(track.uid)));
      this.active.set(station);
      this.playback.playList(tracks, 0);
      return true;
    }));
  }

  stop() {
    this.active.set(null);
    this.queued = new Set();
  }

  /** The reason a track was picked, when it belongs to the station playing */
  reasonOf(track: Song | null): string | null {
    return track && this.active() && this.queued.has(String(track.uid)) ? (track as RadioSong).reason ?? null : null;
  }

  private refill(station: LibraryStation) {
    this.refilling = true;
    this.next(station, [...this.queued]).subscribe({
      next: (tracks) => {
        this.refilling = false;
        // The station may have ended meanwhile
        if (this.active() !== station) {
          return;
        }
        if (!tracks.length) {
          // Every track was played: older ones may come back (the current one is among the last)
          this.queued = new Set([...this.queued].slice(-10));
          return;
        }
        tracks.forEach((track) => this.queued.add(String(track.uid)));
        this.playback.append(tracks);
      },
      error: () => (this.refilling = false),
    });
  }

  private next(station: LibraryStation, exclude: string[]): Observable<RadioSong[]> {
    const params: Record<string, string> = {};
    if (station.seed) {
      params['seed'] = station.seed;
    }
    if (exclude.length) {
      // The most recent ones: the address must stay short
      params['exclude'] = exclude.slice(-200).join(',');
    }
    return this.http.get<{ tracks: RadioSong[] }>(`/api/radios/library/${station.kind}/tracks`, { params })
      .pipe(map((answer) => answer.tracks ?? []));
  }
}
