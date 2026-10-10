import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';

@Component({
  selector: 'app-queue-panel',
  templateUrl: './queue-panel.component.html',
  styleUrls: ['./queue-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, CdkDropList, CdkDrag, CdkDragHandle],
})
export class QueuePanelComponent {
  readonly playback = inject(PlaybackService);

  readonly closed = output<void>();

  /** Index in the queue of the first upcoming track */
  private readonly offset = computed(() => this.playback.position() + 1);

  cover(uid: unknown) {
    return `/api/audio/song-image/${uid}`;
  }

  drop(event: CdkDragDrop<unknown>) {
    if (event.previousIndex !== event.currentIndex) {
      this.playback.move(this.offset() + event.previousIndex, this.offset() + event.currentIndex);
    }
  }

  /** Keyboard alternative to dragging */
  moveBy(index: number, delta: number) {
    const to = index + delta;
    if (to >= 0 && to < this.playback.upcoming().length) {
      this.playback.move(this.offset() + index, this.offset() + to);
    }
  }

  remove(index: number) {
    this.playback.removeAt(this.offset() + index);
  }
}
