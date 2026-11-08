import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { Song } from '../app-state';
import { PlaybackService } from './playback.service';

/** A track of the history, with the time it was last played (ms) */
export type PlayedSong = Song & { playedAt: number };

export interface ListeningStats {
  paused: boolean;
  /** This month: plays and listening time (seconds) */
  month: { month: string; plays: number; seconds: number };
  /** Plays since the history began (or was last cleared) */
  total: number;
  topArtists: { name: string; plays: number }[];
  /** The last 7 days, oldest first; date: YYYY-MM-DD */
  days: { date: string; plays: number }[];
}

/** Listening time after which a track counts as played, in seconds */
const PLAYED_AFTER = 30;
/** A larger jump of the position is a seek, not listening */
const MAX_STEP = 2;

/**
 * Listening history of the connected user (server/app/routes/api/history.js). Reports a
 * track as played once it has been listened to for 30 seconds, or almost entirely when it
 * is shorter; seeking does not count as listening. Created by the shell.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);
  private readonly playback = inject(PlaybackService);

  /** Changed after every recorded play and when the history is cleared */
  readonly version = signal(0);

  /** Seconds listened to the track loaded, since it started */
  private listened = 0;
  private lastTime = 0;
  private reported = false;

  constructor() {
    const audio = this.playback.audio;
    // A new track, or the same track played again from its end
    audio.addEventListener('loadstart', () => this.reset());
    audio.addEventListener('seeked', () => (this.lastTime = audio.currentTime));
    audio.addEventListener('loadedmetadata', () => (this.lastTime = audio.currentTime));
    audio.addEventListener('timeupdate', () => {
      const step = audio.currentTime - this.lastTime;
      this.lastTime = audio.currentTime;
      if (!audio.paused && step > 0 && step < MAX_STEP) {
        this.listened += step;
        this.check();
      }
    });
    audio.addEventListener('ended', () => {
      this.check();
      this.reset();
    });
  }

  recent(limit = 20): Observable<{ paused: boolean; tracks: PlayedSong[] }> {
    return this.http.get<{ paused: boolean; tracks: PlayedSong[] }>('/api/history', { params: { limit } });
  }

  stats(): Observable<ListeningStats> {
    return this.http.get<ListeningStats>('/api/history/stats');
  }

  setPaused(paused: boolean): Observable<{ paused: boolean }> {
    return this.http.put<{ paused: boolean }>('/api/history/settings', { paused });
  }

  clear(): Observable<unknown> {
    return this.http.delete('/api/history').pipe(tap(() => this.version.update((version) => version + 1)));
  }

  private reset() {
    this.listened = 0;
    this.lastTime = this.playback.audio.currentTime || 0;
    this.reported = false;
  }

  private check() {
    const track = this.playback.current();
    const duration = this.playback.duration();
    // Short tracks: nearly the whole track (the last timeupdate comes a little before the end)
    const needed = duration > 0 ? Math.min(PLAYED_AFTER, duration * 0.9) : PLAYED_AFTER;
    if (this.reported || !track || this.listened < needed) {
      return;
    }
    this.reported = true;
    this.http.post<{ recorded: boolean }>('/api/history/plays', { uid: String(track.uid) }).subscribe({
      next: (answer) => answer.recorded && this.version.update((version) => version + 1),
      // Not connected, or the track is gone: nothing to record
      error: () => undefined,
    });
  }
}
