import { Injectable, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { Song } from '../app-state';
import { AuthenticationService } from './authentication.service';
import { PlaybackService } from './playback.service';

/** What is kept of the play queue in the browser */
interface SavedQueue {
  tracks: Song[];
  /** Index of the current track in `tracks` */
  index: number;
  /** Position in the current track, in seconds */
  time: number;
}

const KEY_PREFIX = 'ongaku.queue.';
/** A larger queue is cut around the current track */
const MAX_TRACKS = 2000;
/** The position is saved this often while playing (and when the page closes) */
const POSITION_INTERVAL = 5000;
/** Tags kept with the tracks: grouping by album, track number, lyrics key */
const KEPT_TAGS = ['title', 'album', 'artist', 'album_artist', 'albumartist', 'track', 'disk', 'disc', 'date', 'genre'];

/**
 * Keeps the play queue in the browser, so that it is back, paused at the same position,
 * after a reload of the page. One queue per user (the key holds the username), so that
 * the users of a shared browser do not see each other's queue. Created by the shell.
 */
@Injectable({ providedIn: 'root' })
export class QueueStorageService {
  private readonly playback = inject(PlaybackService);
  private readonly username = toSignal(inject(AuthenticationService).username(), { initialValue: null });
  /** The saved queue of this user has been put back (or there was none) */
  private restoredFor: string | null = null;

  constructor() {
    // Restore once the user is known, if nothing plays yet
    effect(() => {
      const username = this.username();
      if (username && this.restoredFor !== username) {
        this.restoredFor = username;
        untracked(() => this.restore(username));
      }
    });

    // Save on every change of the queue or of the current track
    effect(() => {
      this.playback.tracks();
      this.playback.current();
      untracked(() => this.save());
    });

    setInterval(() => {
      if (this.playback.playing()) {
        this.save();
      }
    }, POSITION_INTERVAL);
    window.addEventListener('pagehide', () => this.save());
    this.playback.audio.addEventListener('pause', () => this.save());
    this.playback.audio.addEventListener('seeked', () => this.save());
  }

  private key(username: string) {
    return KEY_PREFIX + username;
  }

  private restore(username: string) {
    if (this.playback.started()) {
      return;
    }
    let saved: SavedQueue | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(this.key(username)) ?? 'null');
    } catch {
      // Storage unavailable or corrupted: nothing to restore
    }
    if (saved && Array.isArray(saved.tracks) && saved.tracks.length && Number.isInteger(saved.index)) {
      this.playback.restoreSession(saved.tracks, saved.index, Math.max(0, Number(saved.time) || 0));
    }
  }

  private save() {
    const username = this.username();
    // Not before the saved queue is back: it would be replaced by an empty one
    if (!username || this.restoredFor !== username) {
      return;
    }
    const tracks = this.playback.tracks();
    const index = this.playback.position();
    try {
      if (!tracks.length || index < 0) {
        localStorage.removeItem(this.key(username));
        return;
      }
      // Around the current track when the queue is very long
      const start = Math.max(0, Math.min(index - MAX_TRACKS / 2, tracks.length - MAX_TRACKS));
      const kept = tracks.slice(start, start + MAX_TRACKS);
      const saved: SavedQueue = {
        tracks: kept.map((track) => this.slim(track)),
        index: index - start,
        time: this.playback.resumeTime(),
      };
      localStorage.setItem(this.key(username), JSON.stringify(saved));
    } catch {
      // Storage full or unavailable: the queue only lasts until the page is closed
    }
  }

  /** The fields the player and the pages use; the artist details of the pages are dropped */
  private slim(track: Song): Song {
    const { artistDetails, ...rest } = track as Song & Record<string, unknown>;
    const tags = (track.metadatas ?? {}) as Record<string, unknown>;
    const metadatas = Object.fromEntries(KEPT_TAGS.filter((tag) => tags[tag] !== undefined).map((tag) => [tag, tags[tag]]));
    return { ...rest, metadatas, artistDetails: undefined } as unknown as Song;
  }
}
