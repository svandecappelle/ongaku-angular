import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { MaterialModule } from '../../modules/material.module';
import { formatTime } from '../format-time';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';
import { parseDuration } from '../track-list/tracks';
import { AlbumView } from '../library';
import { LibraryService } from '../library.service';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; album: AlbumView };

/** Album page of the new interface */
@Component({
  selector: 'app-album-page',
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, TrackListComponent, SelectionBarComponent],
  providers: [TrackActions],
})
export class AlbumPageComponent {
  readonly actions = inject(TrackActions);
  private readonly library = inject(LibraryService);

  readonly load = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('album') ?? ''),
      switchMap((name) => this.library.album(name).pipe(
        map((album): Load => (album ? { status: 'ready', album } : { status: 'error' })),
        catchError(() => of<Load>({ status: 'error' })),
        startWith<Load>({ status: 'loading' }),
      )),
    ),
    { initialValue: { status: 'loading' } as Load },
  );
  readonly album = computed(() => {
    const load = this.load();
    return load.status === 'ready' ? load.album : null;
  });
  readonly totalDuration = computed(() => (this.album()?.tracks ?? []).reduce((sum, track) => sum + parseDuration(track), 0));

  readonly formatTime = formatTime;

  constructor() {
    effect(() => {
      const album = this.album();
      this.actions.setPage(album?.tracks ?? [], album?.details[0]);
    });
  }
}
