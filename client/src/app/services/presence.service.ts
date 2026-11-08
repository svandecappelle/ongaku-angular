import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';

import { Song } from '../app-state';
import { AuthenticationService } from './authentication.service';
import { PlaybackService } from './playback.service';
import { SocketService } from './socket.service';

/** What a member plays, as relayed by the server */
export interface NowPlaying {
  uid: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  duration: string;
  playing: boolean;
  /** Position (seconds) at the time `at` (ms) */
  position: number;
  at: number;
}

export interface Presence {
  username: string;
  online: boolean;
  nowPlaying: NowPlaying | null;
}

/**
 * Who is online and what they play (server/app/communication.js), live. Also tells the
 * server what this page plays. Created by the shell, for the connected users.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly http = inject(HttpClient);
  private readonly sockets = inject(SocketService);
  private readonly playback = inject(PlaybackService);

  private readonly members = signal<ReadonlyMap<string, Presence>>(new Map());
  private readonly username = toSignal(inject(AuthenticationService).username(), { initialValue: null });

  of(username: string): Presence {
    return this.members().get(username) ?? { username, online: false, nowPlaying: null };
  }

  constructor() {
    const socket = this.sockets.socket;
    socket.on('presence:update', (presence: Presence) => this.update(presence));
    // On every (re)connection: what the others do, and what this page plays
    socket.on('connected', () => {
      this.load();
      this.publish();
    });
    // The notifications may have opened the socket already
    if (socket.connected) {
      this.load();
    }

    // A login or a logout changes the user of the socket: new handshake
    let previous: string | null | undefined;
    effect(() => {
      const username = this.username();
      if (previous !== undefined && previous !== username) {
        untracked(() => this.sockets.reconnect());
      }
      previous = username;
    });

    // Track, play/pause; a seek is sent by the audio element
    effect(() => {
      this.playback.current()?.uid;
      this.playback.playing();
      untracked(() => this.publish());
    });
    this.playback.audio.addEventListener('seeked', () => this.publish());
  }

  /** Plays what a member plays, at the same position */
  listenAlong(nowPlaying: NowPlaying) {
    const elapsed = nowPlaying.playing ? (Date.now() - nowPlaying.at) / 1000 : 0;
    const track = {
      uid: nowPlaying.uid,
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: nowPlaying.album,
      duration: nowPlaying.duration,
      metadatas: { album_artist: nowPlaying.albumArtist },
    } as unknown as Song;
    this.playback.playNow(track, nowPlaying.position + elapsed);
  }

  private load() {
    this.http.get<Presence[]>('/api/users/presence').subscribe({
      next: (list) => this.members.set(new Map(list.map((presence) => [presence.username, presence]))),
      error: () => this.members.set(new Map()),
    });
  }

  private update(presence: Presence) {
    this.members.update((members) => {
      const next = new Map(members);
      presence.online ? next.set(presence.username, presence) : next.delete(presence.username);
      return next;
    });
  }

  private publish() {
    const track = this.playback.current();
    const playing = this.playback.playing();
    this.sockets.socket.emit('now-playing', track && (playing || this.playback.state() === 'paused')
      ? { uid: String(track.uid), playing, position: this.playback.audio.currentTime || 0 }
      : null);
  }
}
