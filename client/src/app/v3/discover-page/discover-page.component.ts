import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';

import { IAppState, Song } from '../../app-state';
import { SearchLibraryAction } from '../../state/search-state';
import { MaterialModule } from '../../modules/material.module';
import { HistoryService } from '../../services/history.service';
import { PlaybackService } from '../../services/playback.service';
import { AlbumCardComponent } from '../album-card/album-card.component';
import { ArtistCardComponent } from '../artist-card/artist-card.component';
import { AlbumItem, ArtistItem, albumArtistOf, albumLink } from '../library';
import { LibraryService } from '../library.service';
import { LibraryEventsService } from '../../services/library-events.service';
import { Paged } from '../paged';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';

/** Albums shown in Recently played */
const RECENT_ALBUMS = 8;

/** Home page of the new interface; shows the search results when there is a search */
@Component({
  selector: 'app-discover-page',
  templateUrl: './discover-page.component.html',
  styleUrls: ['./discover-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, NgTemplateOutlet, RouterLink, TrackListComponent, SelectionBarComponent, AlbumCardComponent, ArtistCardComponent],
  providers: [TrackActions],
})
export class DiscoverPageComponent {
  readonly playback = inject(PlaybackService);
  readonly actions = inject(TrackActions);
  private readonly library = inject(LibraryService);
  private readonly store = inject<Store<IAppState>>(Store);
  private readonly history = inject(HistoryService);
  private readonly events = inject(LibraryEventsService);

  readonly search = toSignal(this.store.select((state) => String(state.search ?? '').trim()), { initialValue: '' });

  // The server pages are small: load 3 pages of artists and albums at once
  readonly artists = new Paged<ArtistItem>((page) => this.library.artists(page, this.search()), LibraryService.ARTISTS_PAGE, 3);
  readonly albums = new Paged<AlbumItem>((page) => this.library.albums(page, this.search()), LibraryService.ALBUMS_PAGE, 3);
  readonly tracks = new Paged<Song>((page) => this.library.tracks(page, this.search()), LibraryService.TRACKS_PAGE);

  /** Albums of the tracks played lately, the latest first, with the cover of the track played */
  readonly recentAlbums = signal<AlbumItem[]>([]);

  readonly loading = computed(() => this.artists.loading() || this.albums.loading() || this.tracks.loading());
  readonly empty = computed(() => !this.loading()
    && !this.artists.items().length && !this.albums.items().length && !this.tracks.items().length);
  readonly failed = computed(() => this.artists.failed() || this.albums.failed() || this.tracks.failed());

  constructor() {
    effect(() => {
      this.search();
      untracked(() => [this.artists, this.albums, this.tracks].forEach((list) => list.reset()));
    });
    effect(() => this.actions.setPage(this.tracks.items(), null));
    // Files added or deleted in the music folders: the lists shown are loaded again
    effect(() => {
      if (this.events.version()) {
        untracked(() => [this.artists, this.albums, this.tracks].forEach((list) => list.refresh()));
      }
    });
    // Reloaded after each recorded play
    effect(() => {
      this.history.version();
      untracked(() => this.loadRecent());
    });
    inject(DestroyRef).onDestroy(() => [this.artists, this.albums, this.tracks].forEach((list) => list.destroy()));
  }

  private loadRecent() {
    this.history.recent(50).subscribe({
      next: ({ tracks }) => {
        const albums = new Map<string, AlbumItem>();
        for (const track of tracks) {
          const artist = albumArtistOf(track);
          const name = String(track.album ?? '');
          const key = `${artist}/${name}`;
          if (name && name !== 'undefined' && !albums.has(key)) {
            albums.set(key, { name, artist, cover: this.cover(track) });
          }
        }
        this.recentAlbums.set([...albums.values()].slice(0, RECENT_ALBUMS));
      },
      error: () => this.recentAlbums.set([]),
    });
  }

  clearSearch() {
    this.store.dispatch(new SearchLibraryAction(''));
  }

  readonly albumLink = albumLink;

  playAlbum(artist: string, name: string) {
    this.library.album(artist, name).subscribe((album) => {
      if (album) {
        this.actions.playFrom(album.tracks);
      }
    });
  }

  cover(track: Song) {
    return `/api/audio/song-image/${track.uid}`;
  }
}
