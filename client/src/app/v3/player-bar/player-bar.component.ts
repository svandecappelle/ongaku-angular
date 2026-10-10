import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';
import { formatTime } from '../format-time';

@Component({
  selector: 'app-player-bar',
  templateUrl: './player-bar.component.html',
  styleUrls: ['./player-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  host: {
    '[class.visible]': 'playback.started()',
  },
})
export class PlayerBarComponent {
  readonly playback = inject(PlaybackService);

  readonly queueOpen = input(false);
  readonly toggleQueue = output<void>();

  /** Position shown while the seek slider is dragged */
  private readonly seeking = signal<number | null>(null);
  /** Gain restored by unmuting */
  private readonly unmutedGain = signal(0.75);

  readonly position = computed(() => this.seeking() ?? this.playback.currentTime());
  readonly volume = computed(() => Math.min(1, this.playback.gain()));
  readonly muted = computed(() => this.playback.gain() === 0);
  readonly formatTime = formatTime;

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
