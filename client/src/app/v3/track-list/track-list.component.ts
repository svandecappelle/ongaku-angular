import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MAT_CHECKBOX_DEFAULT_OPTIONS } from '@angular/material/checkbox';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';
import { TrackActions } from './track-actions.service';

/** Table of tracks with selection; playing a track plays the list from it */
@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  // TrackActions sets the checked state, to handle Shift+click range selection
  providers: [{ provide: MAT_CHECKBOX_DEFAULT_OPTIONS, useValue: { clickAction: 'noop' } }],
})
export class TrackListComponent {
  readonly playback = inject(PlaybackService);
  readonly actions = inject(TrackActions);

  readonly tracks = input.required<Song[]>();
  /** Artist of the page: other artists are shown under the titles */
  readonly artist = input<string | null>(null);
  readonly label = input('Tracks');

  readonly selectedCount = computed(() => this.tracks().filter((track) => this.actions.isSelected(track)).length);

  trackNumber(track: Song, index: number): string {
    const value: any = (track.metadatas as any)?.track;
    const number = typeof value === 'object' && value ? value.no : String(value ?? '').split('/')[0];
    return number ? String(Number(number) || number) : String(index + 1);
  }

  isCurrent(track: Song) {
    return this.playback.current()?.uid === track.uid;
  }
}
