import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { MatDialog } from '@angular/material';

import { Song, IAppState } from '../app-state';
import {
  AppendPlaylist
} from '../player/state';

import { Store, Action, select } from '@ngrx/store';

import { AudioService } from './audio.service';
import { Observable } from 'rxjs/Rx';

import { PlayerActions } from '../player/player-actions';
import { MetadatasComponent } from './metadatas/metadatas.component';
import { searchReducer } from '../header/search-reducer';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public artists = [];
  public _page;
  private selectedOptions = [];

  public tracklist = [];

  constructor(private _audioService: AudioService,
    private _sanitizer: DomSanitizer,
    private store: Store<IAppState>,
    public dialog: MatDialog,
    private actions: PlayerActions) {
    this._page = 0;
  }

  ngOnInit() {
    this.loadMore();
    this.store.select(state => state.trackList).subscribe((val) => {
      this.tracklist = val;
    });

    this.store.select(state => state.search).subscribe((val) => {
      this.search(val);
    });
  }

  loadMore () {
    this._audioService.getPage(this._page).subscribe(
      data => { this.artists = this.artists.concat(data); },
      err => console.error(err),
      () => console.log('done loading artists')
    );

    this._page += 1;
  }

  getImage (src) {
    const image = src.image ? src.image[1]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${image})`);
  }

  actionFrom (action, artist) {
    switch (action) {
      case 'play':
        let index = this.tracklist.length;
        this.selectedOptions[artist].forEach(track => {
          track.index = index;
          index += 1;
        });

        this.store.dispatch(new AppendPlaylist(this.selectedOptions[artist]));
        this.selectedOptions[artist] = [];
        break;
      case 'like':
        break;
    }
  }

  appendToPlaylist (track: Song, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.index = this.tracklist.length;
    this.store.dispatch(new AppendPlaylist(track));
  }

  playNow (track: Song, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.index = this.tracklist.length;
    this.store.dispatch(new AppendPlaylist(track));
    this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(track));
  }

  selectAll(artist, album) {
    if (!this.selectedOptions[artist] || album.tracks.length > this.selectedOptions[artist].length) {
      this.selectedOptions[artist] = album.tracks;
    } else {
      this.selectedOptions[artist] = [];
    }
  }

  metadata(track: Song, event: Event) {
    event.preventDefault();
    event.stopPropagation();
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
