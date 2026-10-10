import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';
import { ArtistService } from '../../services/artist.service';
import { formatTime } from '../format-time';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';
import { parseDuration, trackYear } from '../track-list/tracks';

interface AlbumSummary {
  title: string;
  cover: string | null;
  year: string | null;
  tracks: Song[];
}

interface ArtistView {
  name: string;
  /** Candidate images, tried in order */
  images: string[];
  tags: string[];
  biography: string | null;
  albums: AlbumSummary[];
  tracks: Song[];
  /** Raw answer of the API, given to the metadata dialog */
  details: any;
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; artist: ArtistView };

/** Artist page of the new interface: albums, then their tracks */
@Component({
  selector: 'app-artist-page',
  templateUrl: './artist-page.component.html',
  styleUrls: ['./artist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, TrackListComponent, SelectionBarComponent],
  providers: [TrackActions],
})
export class ArtistPageComponent {
  readonly actions = inject(TrackActions);
  private readonly artists = inject(ArtistService);

  readonly load = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('artist') ?? ''),
      switchMap((name) => this.artists.get(name).pipe(
        map((details): Load => {
          const artist = toArtistView(name, details);
          return artist ? { status: 'ready', artist } : { status: 'error' };
        }),
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

/** Reads the answer of /api/audio/artist/:name (see Library.getArtistDetails on the server) */
function toArtistView(name: string, details: any): ArtistView | null {
  const albums: AlbumSummary[] = (details?.albums ?? [])
    .filter((group: any) => group?.tracks?.length)
    .map((group: any) => {
      const info = typeof group.album_info === 'object' && group.album_info ? group.album_info : {};
      return {
        title: group.album ?? info.title ?? 'Unknown album',
        cover: info.image?.[0] ?? info.cover?.[0] ?? null,
        year: trackYear(group.tracks[0]),
        tracks: group.tracks,
      };
    })
    // Most recent first, albums without a year last
    .sort((a: AlbumSummary, b: AlbumSummary) => (b.year ?? '').localeCompare(a.year ?? ''));
  if (!albums.length) {
    return null;
  }
  const info = details.info ?? {};
  const artistName = details.name ?? name;
  return {
    name: artistName,
    images: [`/api/audio/static/covers/${encodeURIComponent(artistName)}/cover.jpg`, ...(info.image?.[0] ? [info.image[0]] : [])],
    tags: (info.tags?.tag ?? []).map((tag: any) => tag?.name).filter(Boolean).slice(0, 6),
    biography: info.wikipedia || info.bio?.content || info.bio?.summary || null,
    albums,
    tracks: albums.flatMap((album) => album.tracks),
    details,
  };
}
