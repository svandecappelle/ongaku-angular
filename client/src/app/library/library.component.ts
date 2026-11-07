import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { Song } from '../app-state';
import { MaterialModule } from '../modules/material.module';
import { LibraryAlbum, MyLibraryService } from '../services/my-library.service';
import { SelectionBarComponent } from '../v3/selection-bar/selection-bar.component';
import { TrackActions } from '../v3/track-list/track-actions.service';
import { TrackListComponent } from '../v3/track-list/track-list.component';
import { UploadsBrowserComponent } from './uploads-browser.component';

type Tab = 'music' | 'uploads';

/** Albums shown at first, then by this many more */
const ALBUMS_STEP = 20;
/** Placeholder the server gives to albums without a cover */
const NO_COVER = '/static/img/album.png';

/** "My library": the tracks the user added and uploaded, and his uploaded files */
@Component({
  selector: 'app-library',
  templateUrl: './library.component.html',
  styleUrls: ['./library.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, RouterLink, TrackListComponent, SelectionBarComponent, UploadsBrowserComponent],
  providers: [TrackActions],
})
export class LibraryComponent {
  readonly actions = inject(TrackActions);
  private readonly library = inject(MyLibraryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // The tab and the uploads folder are in the URL (?tab=uploads&path=…), to survive a reload
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  readonly tab = computed<Tab>(() => (this.query().get('tab') === 'uploads' || this.route.snapshot.paramMap.has('folder') ? 'uploads' : 'music'));
  readonly uploadsPath = computed(() => this.query().get('path') ?? '');

  readonly albums = signal<LibraryAlbum[] | null>(null);
  readonly failed = signal(false);
  readonly filter = signal('');
  readonly shown = signal(ALBUMS_STEP);

  readonly filtered = computed(() => {
    const filter = this.filter().trim().toLowerCase();
    const albums = this.albums() ?? [];
    if (!filter) {
      return albums;
    }
    return albums
      .map((album) => {
        if (album.title.toLowerCase().includes(filter) || album.artist.toLowerCase().includes(filter)) {
          return album;
        }
        const tracks = album.tracks.filter((track) => String(track.title ?? '').toLowerCase().includes(filter));
        return tracks.length ? { ...album, tracks } : null;
      })
      .filter((album): album is LibraryAlbum => album !== null);
  });
  readonly visible = computed(() => this.filtered().slice(0, this.shown()));
  readonly allTracks = computed(() => this.filtered().flatMap((album) => album.tracks));
  readonly counts = computed(() => {
    const albums = this.albums() ?? [];
    return {
      tracks: albums.reduce((count, album) => count + album.tracks.length, 0),
      albums: albums.length,
      artists: new Set(albums.map((album) => album.artist)).size,
    };
  });

  constructor() {
    this.load();
    // Tracks removed from the library (or added back by Undo) disappear from the page
    let first = true;
    effect(() => {
      this.library.version();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.load());
    });
    effect(() => this.actions.setPage(this.visible().flatMap((album) => album.tracks), null));
    effect(() => {
      this.filter();
      untracked(() => this.shown.set(ALBUMS_STEP));
    });
  }

  load() {
    this.failed.set(false);
    this.library.content().subscribe({
      next: (content) => this.albums.set(content.albums.map((album) => ({ ...album, cover: album.cover === NO_COVER ? null : album.cover }))),
      error: () => this.failed.set(true),
    });
  }

  selectTab(tab: Tab) {
    this.router.navigate(['/my-library'], { queryParams: tab === 'uploads' ? { tab } : {} });
  }

  openFolder(path: string) {
    this.router.navigate(['/my-library'], { queryParams: path ? { tab: 'uploads', path } : { tab: 'uploads' } });
  }

  showMore() {
    this.shown.update((shown) => shown + ALBUMS_STEP);
  }

  trackKey(album: LibraryAlbum) {
    return `${album.artist}\u0000${album.title}`;
  }

  play(tracks: Song[]) {
    this.actions.playFrom(tracks);
  }
}
