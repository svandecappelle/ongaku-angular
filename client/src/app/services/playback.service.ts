import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { distinctUntilChanged } from 'rxjs/operators';

import { IAppState, Song } from '../app-state';
import { PlayerActions } from '../player/player-actions';
import { AppendPlaylist, SetPlaylist } from '../player/controls/playlist/playlist-state';

export type PlaybackState = 'stopped' | 'loading' | 'playing' | 'paused';

/** Queue and position before a change, to undo it */
export interface QueueSnapshot {
  tracks: Song[];
  current: Song | null;
  time: number;
}

/**
 * Owns the audio element and the play queue logic, so that the player keeps
 * playing whatever component displays it (classic or new interface).
 *
 * The queue itself stays in the store (`trackList`), and the track to play is
 * still requested with the `PLAY_SELECTED_TRACK` action: pages that dispatch
 * these actions directly keep working.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly store = inject<Store<IAppState>>(Store);
  private readonly actions = new PlayerActions();

  readonly audio = new Audio();
  readonly context = new AudioContext();
  /** Source node of the audio element, for the level meter */
  readonly source = this.context.createMediaElementSource(this.audio);
  private readonly gainNode = this.context.createGain();
  /** Position to start the next loaded track at, in seconds */
  private startAt = 0;

  readonly tracks = toSignal(this.store.select((state) => state.trackList), { initialValue: [] as Song[] });
  readonly current = signal<Song | null>(null);
  readonly state = signal<PlaybackState>('stopped');
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  /** Gain applied to the audio, 1 = original volume */
  readonly gain = signal(0.75);
  /** A track has been loaded at least once */
  readonly started = signal(false);

  readonly playing = computed(() => this.state() === 'playing');
  readonly progress = computed(() => (this.duration() ? (this.currentTime() / this.duration()) * 100 : 0));
  /** Position of the current track in the queue, -1 when it is not in it */
  readonly position = computed(() => {
    const current = this.current();
    const tracks = this.tracks();
    // By reference first: the same track can be in the queue several times
    const index = tracks.indexOf(current);
    return index >= 0 || !current ? index : tracks.findIndex((track) => track.uid === current.uid);
  });
  readonly upcoming = computed(() => this.tracks().slice(this.position() + 1));

  constructor() {
    this.gainNode.gain.value = this.gain();
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration.set(this.audio.duration);
      this.audio.currentTime = this.startAt;
      this.currentTime.set(this.startAt);
      this.startAt = 0;
    });
    this.audio.addEventListener('timeupdate', () => this.currentTime.set(this.audio.currentTime));
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('canplay', () => {
      if (this.state() === 'loading') {
        this.resume();
      }
    });

    this.store.select((state) => state.player?.track).pipe(distinctUntilChanged()).subscribe((track) => {
      if (track) {
        this.load(track);
      }
    });

    // The first track added to an empty queue starts playing
    this.store.select((state) => state.trackList).subscribe((tracks) => {
      if (!this.current() && tracks?.length) {
        this.load(tracks[0]);
      }
    });
  }

  toggle() {
    if (this.playing()) {
      this.pause();
    } else {
      this.resume();
    }
  }

  resume() {
    if (!this.current()) {
      return;
    }
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    this.audio.play()
      .then(() => this.state.set('playing'))
      // Autoplay refused by the browser: wait for a click on play
      .catch(() => this.state.set('paused'));
  }

  pause() {
    this.audio.pause();
    this.state.set('paused');
  }

  /** Plays a track of the queue */
  play(track: Song, startAt = 0) {
    if (track.uid === this.current()?.uid) {
      this.current.set(track);
      this.seek(startAt);
      this.resume();
    } else {
      this.startAt = startAt;
      this.store.dispatch(this.actions.playSelectedTrack(track));
    }
  }

  next() {
    const next = this.tracks()[this.position() + 1];
    if (next) {
      this.play(next);
    } else {
      // End of the queue
      this.audio.pause();
      this.seek(0);
      this.state.set('paused');
    }
  }

  previous() {
    const previous = this.tracks()[this.position() - 1];
    if (previous) {
      this.play(previous);
    }
  }

  seek(seconds: number) {
    this.audio.currentTime = seconds;
    this.currentTime.set(seconds);
  }

  setGain(gain: number) {
    this.gain.set(gain);
    this.gainNode.gain.value = gain;
  }

  /** Adds tracks at the end of the queue */
  append(tracks: Song[]) {
    const start = this.tracks().length;
    this.store.dispatch(new AppendPlaylist(tracks.map((track, i) => ({ ...track, index: start + i }))));
  }

  /** Adds a track at the end of the queue and plays it */
  playNow(track: Song) {
    const copy = { ...track, index: this.tracks().length };
    this.store.dispatch(new AppendPlaylist([copy]));
    this.play(copy);
  }

  /** Replaces the queue with the given tracks and plays one of them; returns what to restore to undo it */
  playList(tracks: Song[], start = 0): QueueSnapshot {
    const snapshot = { tracks: this.tracks(), current: this.current(), time: this.currentTime() };
    this.play(this.setQueue(tracks)[start]);
    return snapshot;
  }

  /** Inserts tracks right after the current one */
  playNext(tracks: Song[]) {
    const queue = [...this.tracks()];
    queue.splice(this.position() + 1, 0, ...tracks);
    this.setQueue(queue);
  }

  /** Undoes playList: previous queue, track and position */
  restore(snapshot: QueueSnapshot) {
    const at = snapshot.tracks.indexOf(snapshot.current);
    const queue = this.setQueue(snapshot.tracks);
    if (at >= 0) {
      this.play(queue[at], snapshot.time);
    }
  }

  removeAt(index: number) {
    this.setQueue(this.tracks().filter((_, i) => i !== index));
  }

  move(from: number, to: number) {
    const tracks = [...this.tracks()];
    tracks.splice(to, 0, ...tracks.splice(from, 1));
    this.setQueue(tracks);
  }

  /** Removes the tracks after the current one */
  clearUpcoming() {
    this.setQueue(this.tracks().slice(0, this.position() + 1));
  }

  private setQueue(tracks: Song[]): Song[] {
    const queue = tracks.map((track, index) => ({ ...track, index }));
    // Keep pointing at the current track in the new copies
    const at = tracks.indexOf(this.current());
    if (at >= 0) {
      this.current.set(queue[at]);
    }
    this.store.dispatch(new SetPlaylist(queue));
    return queue;
  }

  private load(track: Song) {
    this.current.set(track);
    this.state.set('loading');
    this.started.set(true);
    this.duration.set(0);
    this.currentTime.set(0);
    this.audio.src = `/api/audio/stream/${track.uid}`;
  }
}
