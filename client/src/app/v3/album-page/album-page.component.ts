import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';
import { AlbumService } from '../../services/album.service';
import { formatTime } from '../format-time';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';
import { parseDuration, trackYear } from '../track-list/tracks';

interface AlbumView {
  title: string;
  artist: string;
  cover: string | null;
  year: string | null;
  tracks: Song[];
  /** Raw answer of the API, given to the metadata dialog */
  details: any;
}

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
  private readonly albums = inject(AlbumService);

  readonly load = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('album') ?? ''),
      switchMap((name) => this.albums.get(name).pipe(
        map((details): Load => {
          const album = toAlbumView(name, details);
          return album ? { status: 'ready', album } : { status: 'error' };
        }),
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

/** Reads the answer of /api/audio/album/:name (see Library.getAlbum on the server) */
function toAlbumView(name: string, details: any): AlbumView | null {
  const group = details?.[0]?.albums?.[0];
  if (!group?.tracks?.length) {
    return null;
  }
  const info = typeof group.album_info === 'object' && group.album_info ? group.album_info : {};
  const tracks: Song[] = group.tracks;
  return {
    title: group.album ?? name,
    artist: info.artist?.name ?? info.artist ?? tracks[0].artist,
    cover: info.image?.[0] ?? info.cover?.[0] ?? null,
    year: trackYear(tracks[0]),
    tracks,
    details,
  };
}
