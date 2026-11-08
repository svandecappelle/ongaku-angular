import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';
import { A11yModule } from '@angular/cdk/a11y';
import { BreakpointObserver } from '@angular/cdk/layout';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';
import { LikesService } from '../../services/likes.service';
import { LyricsService } from '../../services/lyrics.service';
import { AuthenticationService } from '../../services/authentication.service';
import { LyricsViewComponent } from '../lyrics/lyrics-view.component';
import { StationTileComponent } from '../radios-page/station-tile.component';
import { RadiosService } from '../../services/radios.service';
import { PeaksService } from '../../services/peaks.service';
import { VisualizerService } from '../../services/visualizer.service';
import { PlayerAnimation, ThemeService } from '../../services/theme.service';
import { WaveformSeekComponent } from '../visualizers/waveform-seek.component';
import { CoverGlowComponent } from '../visualizers/cover-glow.component';
import { SpectrumComponent } from '../visualizers/spectrum.component';
import { AmbientBackdropComponent } from '../visualizers/ambient-backdrop.component';
import { SpinningDiscComponent } from '../visualizers/spinning-disc.component';
import { PLAYER_ANIMATION_CHOICES } from '../visualizers/player-animations';
import { LibraryRadioService } from '../../services/library-radio.service';
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
  imports: [
    MaterialModule, A11yModule, RouterLink, LyricsViewComponent, StationTileComponent, WaveformSeekComponent,
    CoverGlowComponent, SpectrumComponent, AmbientBackdropComponent, SpinningDiscComponent,
  ],
  host: {
    '[class.visible]': 'playback.started()',
    '[class.expanded]': 'expanded()',
    '[class.live]': 'playback.live()',
  },
})
export class PlayerBarComponent {
  readonly playback = inject(PlaybackService);
  readonly likes = inject(LikesService);
  readonly radios = inject(RadiosService);
  readonly libraryRadio = inject(LibraryRadioService);
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
  readonly seeking = signal<number | null>(null);
  private readonly visualizer = inject(VisualizerService);
  private readonly peaksService = inject(PeaksService);
  /** Waveform of the current track, null while it loads or when it cannot be read */
  readonly peaks = toSignal(
    toObservable(computed(() => this.playback.current()?.uid ?? null)).pipe(
      // The plain slider until the waveform of the new track comes: never the previous one
      switchMap((uid) => (uid ? this.peaksService.get(String(uid)).pipe(startWith(null)) : of(null))),
    ),
    { initialValue: null },
  );
  private readonly theme = inject(ThemeService);
  /** Animations of the full-screen player, to pick from its header and in Appearance */
  readonly animations = PLAYER_ANIMATION_CHOICES;
  readonly animation = this.theme.playerAnimation;
  /** With the visualizers off: no decoration, but the disc stays (a still disc with the progress) */
  private readonly decorated = computed(() => this.visualizer.motion() !== 'off');
  readonly showGlow = computed(() => this.animation() === 'glow' && this.decorated());
  readonly showSpectrum = computed(() => this.animation() === 'spectrum' && this.decorated());
  readonly showAmbient = computed(() => this.animation() === 'ambient' && this.decorated());
  readonly showDisc = computed(() => this.animation() === 'disc');

  setAnimation(playerAnimation: PlayerAnimation) {
    this.theme.update({ playerAnimation });
  }

  /** The seek bars show the waveform, unless the visualizers are turned off */
  readonly showWaveform = computed(() => !!this.peaks() && this.visualizer.motion() !== 'off');
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

  toggleStationFavourite() {
    const station = this.playback.station();
    if (!station) {
      return;
    }
    const favourite = !station.favourite;
    this.playback.station.set({ ...station, favourite });
    this.radios.setFavourite(station.id, favourite).subscribe({
      error: () => this.playback.station.update((current) => current && current.id === station.id ? { ...current, favourite: !favourite } : current),
    });
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
