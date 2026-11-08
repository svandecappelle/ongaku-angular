import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';
import { LikesService } from '../../services/likes.service';
import { Song } from '../../app-state';
import { formatTime } from '../format-time';
import { albumLink } from '../library';

@Component({
  selector: 'app-player-bar',
  templateUrl: './player-bar.component.html',
  styleUrls: ['./player-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, A11yModule, RouterLink],
  host: {
    '[class.visible]': 'playback.started()',
    '[class.expanded]': 'expanded()',
  },
})
export class PlayerBarComponent {
  readonly playback = inject(PlaybackService);
  readonly likes = inject(LikesService);

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
