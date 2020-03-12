import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';

import { Song, IAppState } from '../app-state';
import {
  AppendPlaylist
} from '../player/state';

import { Store, Action, select } from '@ngrx/store';

import { AudioService } from '../audio.service';
import { Observable, Subscription } from 'rxjs';

import { PlayerActions } from '../player/player-actions';
import { MetadatasComponent } from '../metadatas/metadatas.component';
import { searchReducer } from '../header/search-reducer';

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss']
})
export class SearchComponent implements OnInit, OnDestroy {

  public artists = [];
  public _page;

  private selectedOptions = [];

  loading: Boolean = true;

  private images = {
    artists: Object,
    albums: Object
  };

  public tracklist = [];

  public subscriptions = new Array<Subscription>();

  constructor(private _audioService: AudioService,
    private _sanitizer: DomSanitizer,
    private store: Store<IAppState>,
    public dialog: MatDialog,
    private actions: PlayerActions) {
    this._page = 0;
  }

  ngOnInit() {
    this.subscriptions.push(this.store.select(state => state.trackList).subscribe((val) => {
      this.tracklist = val;
    }));

    this.subscriptions.push(this.store.select(state => state.search).subscribe((val) => {
      this.search(val);
    }));
  }

  ngOnDestroy() {
    this.subscriptions.forEach(subscribe => {
      subscribe.unsubscribe();
    });
  }

  loadMore () {
    this.loading = true;
    this._audioService.getPage(this._page).subscribe(
      data => {
        this.loading = false;
        data.forEach(artist => {
          this.images.artists[artist.artist_info.name] = this.getImageSrc(artist.artist_info);
          artist.albums.forEach(album => {
            this.images.albums[album.title] = this.getImageSrc(album.album_info);
          });
        });

        this.artists = this.artists.concat(data);
      },
      err => {
        this.loading = false;
        console.error(err);
      },
      () => this.loading = false
    );

    this._page += 1;
  }

  getImageSrc(src) {
    const image = src.image ? src.image[3]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustUrl(`${image}`);
  }

  getImage (src) {
    const image = src.image ? src.image[1]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${image})`);
  }

  actionFrom (action, artist) {
    switch (action) {
      case 'play':
        let index = this.tracklist.length;
        this.selectedOptions[artist.artist].forEach(track => {
          track.index = index;
          track.artistDetails = artist;
          index += 1;
        });

        this.store.dispatch(new AppendPlaylist(this.selectedOptions[artist.artist]));
        this.selectedOptions[artist.artist] = [];
        break;
      case 'like':
        break;
    }
  }

  appendToPlaylist (track: Song, artist, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.index = this.tracklist.length;
    track.artistDetails = artist;
    this.store.dispatch(new AppendPlaylist(track));
  }

  playNow (track: Song, artist, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.index = this.tracklist.length;
    track.artistDetails = artist;
    this.store.dispatch(new AppendPlaylist(track));
    this.store.dispatch(this.actions.playSelectedTrack(track));
  }

  selectAll(artist, album) {
    if (!this.selectedOptions[artist] || album.tracks.length > this.selectedOptions[artist].length) {
      this.selectedOptions[artist] = album.tracks;
    } else {
      this.selectedOptions[artist] = [];
    }
  }

  metadata(track: Song, artist, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.artistDetails = artist;
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data: track
    });
  }

  onTracksSelectionChanged(tracks) {
    // console.log(tracks);
    // console.log(this.selectedOptions)
  }

  search(criterion) {
    this._page = 0;
    this.artists = [];
    this._audioService.filter = criterion;
    this.loadMore();
  }
}
