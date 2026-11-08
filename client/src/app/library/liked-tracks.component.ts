import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../modules/material.module';
import { LikedSong, LikesService } from '../services/likes.service';
import { formatTime } from '../v3/format-time';
import { SelectionBarComponent } from '../v3/selection-bar/selection-bar.component';
import { TrackActions } from '../v3/track-list/track-actions.service';
import { TrackListComponent } from '../v3/track-list/track-list.component';
import { parseDuration } from '../v3/track-list/tracks';

type Sort = 'recent' | 'oldest' | 'title' | 'artist';

/** "Liked" tab of My library: the liked tracks, as an automatic playlist */
@Component({
  selector: 'app-liked-tracks',
  templateUrl: './liked-tracks.component.html',
  styleUrls: ['./liked-tracks.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, RouterLink, TrackListComponent, SelectionBarComponent],
  providers: [TrackActions],
})
export class LikedTracksComponent {
  readonly actions = inject(TrackActions);
  private readonly likes = inject(LikesService);

  readonly tracks = signal<LikedSong[] | null>(null);
  readonly missing = signal(0);
  readonly failed = signal(false);
  readonly filter = signal('');
  readonly sort = signal<Sort>('recent');

  readonly sorts: { id: Sort; label: string }[] = [
    { id: 'recent', label: 'Recently liked' },
    { id: 'oldest', label: 'First liked' },
    { id: 'title', label: 'Title' },
    { id: 'artist', label: 'Artist' },
  ];

  /** Unliked tracks leave at once, before the list is loaded again */
  readonly liked = computed(() => (this.tracks() ?? []).filter((track) => this.likes.has(track)));
  readonly shown = computed(() => {
    const filter = this.filter().trim().toLowerCase();
    const text = (value: unknown) => String(value ?? '').toLowerCase();
    const tracks = filter
      ? this.liked().filter((track) => [track.title, track.artist, track.album].some((value) => text(value).includes(filter)))
      : [...this.liked()];
    switch (this.sort()) {
      case 'oldest':
        return tracks.sort((a, b) => a.likedAt - b.likedAt);
      case 'title':
        return tracks.sort((a, b) => text(a.title).localeCompare(text(b.title)));
      case 'artist':
        return tracks.sort((a, b) => text(a.artist).localeCompare(text(b.artist)) || text(a.album).localeCompare(text(b.album)));
      default:
        return tracks.sort((a, b) => b.likedAt - a.likedAt);
    }
  });
  readonly totalDuration = computed(() => this.liked().reduce((sum, track) => sum + parseDuration(track), 0));

  readonly formatTime = formatTime;

  constructor() {
    // Part of My library: users delete their own uploads here too
    this.actions.ownDelete.set(true);
    this.load();
    // Tracks liked elsewhere (player bar) show up
    let first = true;
    effect(() => {
      this.likes.version();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.load());
    });
    effect(() => this.actions.setPage(this.shown(), null));
  }

  load() {
    this.failed.set(false);
    this.likes.list().subscribe({
      next: (answer) => {
        this.tracks.set(answer.tracks);
        this.missing.set(answer.missing);
      },
      error: () => this.failed.set(true),
    });
  }
}
