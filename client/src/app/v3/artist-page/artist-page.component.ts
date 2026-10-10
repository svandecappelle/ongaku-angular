import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { MaterialModule } from '../../modules/material.module';
import { AlbumCardComponent } from '../album-card/album-card.component';
import { formatTime } from '../format-time';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';
import { parseDuration } from '../track-list/tracks';
import { AlbumSummary, ArtistView } from '../library';
import { LibraryService } from '../library.service';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; artist: ArtistView };

/** Artist page of the new interface: albums, then their tracks */
@Component({
  selector: 'app-artist-page',
  templateUrl: './artist-page.component.html',
  styleUrls: ['./artist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, TrackListComponent, SelectionBarComponent, AlbumCardComponent],
  providers: [TrackActions],
})
export class ArtistPageComponent {
  readonly actions = inject(TrackActions);
  private readonly library = inject(LibraryService);

  readonly load = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('artist') ?? ''),
      switchMap((name) => this.library.artist(name).pipe(
        map((artist): Load => (artist ? { status: 'ready', artist } : { status: 'error' })),
        catchError(() => of<Load>({ status: 'error' })),
        startWith<Load>({ status: 'loading' }),
      )),
    ),
    { initialValue: { status: 'loading' } as Load },
  );
  readonly artist = computed(() => {
    const load = this.load();
    return load.status === 'ready' ? load.artist : null;
  });
  /** Index of the artist image being tried, see ArtistView.images */
  readonly imageIndex = signal(0);
  readonly image = computed(() => this.artist()?.images[this.imageIndex()] ?? null);
  readonly totalDuration = computed(() => (this.artist()?.tracks ?? []).reduce((sum, track) => sum + parseDuration(track), 0));

  readonly formatTime = formatTime;

  constructor() {
    effect(() => {
      const artist = this.artist();
      this.imageIndex.set(0);
      this.actions.setPage(artist?.tracks ?? [], artist?.details);
    });
  }

  albumId(album: AlbumSummary) {
    return 'album-' + album.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}
