import { Injectable, effect, inject, untracked } from '@angular/core';

import { PlaybackService } from './playback.service';

/** Step of the "seek backward / forward" buttons, when the system does not give one */
const SEEK_STEP = 10;

type Handlers = Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;

/**
 * Shows the track playing on the lock screen and in the system media controls
 * (notification, headset, keyboard media keys…), and routes their buttons to the player.
 * Created by the shell.
 */
@Injectable({ providedIn: 'root' })
export class MediaSessionService {
  private readonly playback = inject(PlaybackService);
  private readonly session = 'mediaSession' in navigator ? navigator.mediaSession : null;

  constructor() {
    const session = this.session;
    if (!session) {
      return;
    }

    // Title, artist, album and cover of the current track
    effect(() => {
      const track = this.playback.current();
      session.metadata = track
        ? new MediaMetadata({
            title: String(track.title ?? ''),
            artist: String(track.artist ?? ''),
            album: String(track.album ?? ''),
            artwork: [{ src: new URL(`/api/audio/song-image/${track.uid}`, location.origin).href }],
          })
        : null;
    });

    effect(() => {
      const state = this.playback.state();
      session.playbackState = state === 'playing' ? 'playing' : state === 'stopped' ? 'none' : 'paused';
      untracked(() => this.updatePosition());
    });

    // The previous and next buttons only appear when there is a track to go to
    effect(() => {
      const hasPrevious = this.playback.position() > 0;
      const hasNext = this.playback.upcoming().length > 0;
      this.setHandlers({
        previoustrack: hasPrevious ? () => this.playback.previous() : null,
        nexttrack: hasNext ? () => this.playback.next() : null,
      });
    });

    this.setHandlers({
      play: () => this.playback.resume(),
      pause: () => this.playback.pause(),
      stop: () => this.playback.pause(),
      seekbackward: (details) => this.seekBy(-(details.seekOffset || SEEK_STEP)),
      seekforward: (details) => this.seekBy(details.seekOffset || SEEK_STEP),
      seekto: (details) => {
        if (details.seekTime !== undefined) {
          this.playback.seek(details.seekTime);
          this.updatePosition();
        }
      },
    });

    // The system moves the progress bar by itself while playing: only jumps need telling
    const audio = this.playback.audio;
    for (const event of ['loadedmetadata', 'seeked', 'ratechange']) {
      audio.addEventListener(event, () => this.updatePosition());
    }
  }

  private seekBy(offset: number) {
    const duration = this.playback.duration() || Infinity;
    this.playback.seek(Math.min(Math.max(this.playback.audio.currentTime + offset, 0), duration));
    this.updatePosition();
  }

  private updatePosition() {
    const session = this.session;
    const audio = this.playback.audio;
    const duration = this.playback.duration();
    if (!session?.setPositionState) {
      return;
    }
    try {
      if (Number.isFinite(duration) && duration > 0) {
        session.setPositionState({
          duration,
          position: Math.min(Math.max(audio.currentTime, 0), duration),
          playbackRate: audio.playbackRate || 1,
        });
      } else {
        // Not loaded yet, or a live stream: no progress bar
        session.setPositionState();
      }
    } catch {
      // Inconsistent values while a track loads: the next update fixes them
    }
  }

  private setHandlers(handlers: Handlers) {
    for (const [action, handler] of Object.entries(handlers) as [MediaSessionAction, MediaSessionActionHandler | null][]) {
      try {
        this.session?.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser
      }
    }
  }
}
