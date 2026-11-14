import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { MaterialModule } from '../../modules/material.module';
import { formatTime } from '../format-time';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';
import { CoverEditComponent } from '../cover-edit/cover-edit.component';
import { parseDuration } from '../track-list/tracks';
import { AlbumView } from '../library';
import { LibraryService } from '../library.service';
import { LibraryEventsService } from '../../services/library-events.service';

type Choice = { artist: string; tracks: number; cover: string | null };
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; album: AlbumView }
  /** Link giving only the title, shared by albums of several artists */
  | { status: 'choose'; title: string; choices: Choice[] };

/** Album page of the new interface */
@Component({
  selector: 'app-album-page',
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, TrackListComponent, SelectionBarComponent, CoverEditComponent],
  providers: [TrackActions],
})
export class AlbumPageComponent {
  readonly actions = inject(TrackActions);
  private readonly library = inject(LibraryService);
  private readonly events = inject(LibraryEventsService);

  private readonly router = inject(Router);

  readonly load = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => ({ artist: params.get('artist'), name: params.get('album') ?? '' })),
      // Loaded again when the library changes (files added or deleted meanwhile)
      switchMap(({ artist, name }) => this.events.reloading(() => (artist !== null ? this.library.album(artist, name).pipe(
        map((album): Load => (album ? { status: 'ready', album } : { status: 'error' })),
      ) : this.resolve(name)).pipe(
        catchError(() => of<Load>({ status: 'error' })),
      ), { status: 'loading' } as Load)),
    ),
    { initialValue: { status: 'loading' } as Load },
  );
  readonly album = computed(() => {
    const load = this.load();
    return load.status === 'ready' ? load.album : null;
  });
  /** A compilation's artist ("Various Artists") has no page */
  readonly artistHasPage = computed(() => {
    const album = this.album();
    return !!album && album.tracks.some((track) => track.artist === album.artist);
  });
  readonly totalDuration = computed(() => (this.album()?.tracks ?? []).reduce((sum, track) => sum + parseDuration(track), 0));
  /** Set when an administrator changed the cover: the covers route serves the new one (or the default) */
  readonly coverOverride = signal<string | null>(null);

  readonly formatTime = formatTime;

  constructor() {
    effect(() => {
      const album = this.album();
      this.coverOverride.set(null);
      this.actions.setPage(album?.tracks ?? [], album?.details[0]);
    });
  }

  /** Old links give only the title: the album when a single artist has one, else a choice */
  private resolve(name: string): Observable<Load> {
    return this.library.albumArtists(name).pipe(map((choices): Load => {
      if (choices.length === 1) {
        this.router.navigate(['/album', choices[0].artist, name], { replaceUrl: true });
        return { status: 'loading' };
      }
      return choices.length ? { status: 'choose', title: name, choices } : { status: 'error' };
    }));
  }

  coverChanged(artist: string, title: string) {
    this.coverOverride.set(`/api/audio/static/covers/${encodeURIComponent(artist)}/${encodeURIComponent(title)}/cover.jpg?v=${Date.now()}`);
  }
}
