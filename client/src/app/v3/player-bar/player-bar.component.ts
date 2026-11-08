import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { A11yModule } from '@angular/cdk/a11y';
import { BreakpointObserver } from '@angular/cdk/layout';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';
import { LikesService } from '../../services/likes.service';
import { LyricsService } from '../../services/lyrics.service';
import { AuthenticationService } from '../../services/authentication.service';
import { LyricsViewComponent } from '../lyrics/lyrics-view.component';
import { LyricsEditorDialogComponent } from '../lyrics/lyrics-editor-dialog.component';
import { parseLrc } from '../lyrics/lrc';
import { Song } from '../../app-state';
import { formatTime } from '../format-time';
import { albumLink } from '../library';

@Component({
  selector: 'app-player-bar',
  templateUrl: './player-bar.component.html',
  styleUrls: ['./player-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, A11yModule, RouterLink, LyricsViewComponent],
  host: {
    '[class.visible]': 'playback.started()',
    '[class.expanded]': 'expanded()',
  },
})
export class PlayerBarComponent {
  readonly playback = inject(PlaybackService);
  readonly likes = inject(LikesService);
  private readonly lyricsService = inject(LyricsService);
  private readonly dialog = inject(MatDialog);
  readonly administrator = toSignal(inject(AuthenticationService).isAdministrator(), { initialValue: false });

  /** Lyrics of the current track, null when it has none */
  readonly lyrics = toSignal(
    toObservable(computed(() => ({ uid: this.playback.current()?.uid, version: this.lyricsService.version() }))).pipe(
      switchMap(({ uid }) => (uid ? this.lyricsService.get(String(uid)).pipe(map((lyrics) => (lyrics.lrc ? parseLrc(lyrics.lrc) : null))) : of(null))),
      map((lyrics) => (lyrics?.lines.length ? lyrics : null)),
    ),
    { initialValue: null },
  );
  /** The full-screen player shows the lyrics: instead of the cover, or next to it on wide screens */
  readonly showLyrics = signal(false);
  private readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 960px)').pipe(map((state) => state.matches)), { initialValue: false });
  readonly lyricsBesideCover = computed(() => this.wide() && this.showLyrics() && !!this.lyrics());
  readonly lyricsInsteadOfCover = computed(() => !this.wide() && this.showLyrics() && !!this.lyrics());

  readonly queueOpen = input(false);
  readonly toggleQueue = output<void>();

  /** Position shown while the seek slider is dragged */
  private readonly seeking = signal<number | null>(null);
  /** Full-screen player, opened from the cover */
  readonly expanded = signal(false);
  /** Gain restored by unmuting (the saved volume may be muted: then the default) */
  private readonly unmutedGain = signal(this.playback.gain() || 0.75);

  readonly position = computed(() => this.seeking() ?? this.playback.currentTime());
  readonly volume = computed(() => Math.min(1, this.playback.gain()));
  readonly muted = computed(() => this.playback.gain() === 0);
  readonly formatTime = formatTime;
  readonly albumLink = albumLink;

  toggleLike(track: Song) {
    (this.likes.has(track) ? this.likes.unlike([track]) : this.likes.like([track])).subscribe();
  }

  openLyrics() {
    this.showLyrics.set(true);
    this.expanded.set(true);
  }

  editLyrics(track: Song) {
    this.dialog.open(LyricsEditorDialogComponent, { data: track, autoFocus: 'dialog' }).afterClosed().subscribe((lyrics) => {
      if (lyrics) {
        this.showLyrics.set(!!lyrics.lrc);
      }
    });
  }

  openQueue() {
    this.expanded.set(false);
    if (!this.queueOpen()) {
      this.toggleQueue.emit();
    }
  }

  cover(uid: unknown) {
    return `/api/audio/song-image/${uid}`;
  }

  dragSeek(event: Event) {
    this.seeking.set(Number((event.target as HTMLInputElement).value));
  }

  commitSeek(event: Event) {
    this.playback.seek(Number((event.target as HTMLInputElement).value));
    this.seeking.set(null);
  }

  setVolume(event: Event) {
    this.playback.setGain(Number((event.target as HTMLInputElement).value));
  }

  toggleMute() {
    if (this.muted()) {
      this.playback.setGain(this.unmutedGain() || 0.75);
    } else {
      this.unmutedGain.set(this.playback.gain());
      this.playback.setGain(0);
    }
  }
}
