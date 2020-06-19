import { Component, OnInit } from '@angular/core';

import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { Song, IAppState } from 'app/app-state';
import { AppendPlaylist } from 'app/player/state';
import { ToggleBackgroundTypeAction, ToggleBackgroundType } from 'app/content/content-state';

import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';

import { PlayerActions } from 'app/player/player-actions';
import { MetadatasComponent } from 'app/metadatas/metadatas.component';

import { AlbumService } from 'app/services/album.service';


@Component({
  selector: 'app-album',
  templateUrl: './album.component.html',
  styleUrls: ['./album.component.scss']
})
export class AlbumComponent implements OnInit {

  public tracklist = [];
  public subscriptions = new Subscription();

  private selectedOptions = [];
  private covers: Object = {};

  private _albumsIdCounter: number = 0;  

  album: string; 
  details: Object;
  image;
  toggleBackground = true;
  background: SafeStyle;

  constructor(
    private activatedRoute: ActivatedRoute,
    private service: AlbumService,
    private _sanitizer: DomSanitizer,
    private store: Store<IAppState>,
    public dialog: MatDialog,
    private actions: PlayerActions) { }

  ngOnInit() {
    this.subscriptions.add(this.store.select(state => state.trackList).subscribe((val) => {
      this.tracklist = val;
    }));

    this.subscriptions.add(this.store.select(state => state.search).subscribe((val) => {
      this.search(val);
    }));

    this.subscriptions.add(this.store.select(state => state.showBackgroundOnViews).subscribe((val) => {
      this.toggleBackground = !val;
    }));

    this.activatedRoute.params.subscribe((params: Params) => {
      this.album = params['album'];

      this.subscriptions.add(this.service.get(this.album).subscribe((details) => {
        details.artist_info = {
          bio: ""
        };
        this.details = details;
        this.image = this.getImageSrc();
        this.background = this.getAlbumBackground();

        details[0].albums[0].tracks.forEach(track => {
          track.waveform = this.getWaveform(track);
        });

      }));
    });

  }


  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  getAlbumBackground() {
    const src = this.details[0].albums[0].album_info;
    let image = src.image[0];
    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url('${this.image}')`);
  }

  getImageSrc() {
    const src = this.details[0].albums[0].album_info;
    let image = src.image[0];
    return this._sanitizer.bypassSecurityTrustUrl(`${image}`);
  }

  getWaveform(track) {
    return this._sanitizer.bypassSecurityTrustStyle(`url('/api/downloader/waveform/${track.uid }')`)
  }

  actionFrom (action, artist) {
    switch (action) {
      case 'play':
        let index = this.tracklist.length;
        this.selectedOptions[artist].forEach(track => {
          track.index = index;
          track.artistDetails = this.details;
          index += 1;
        });

        this.store.dispatch(new AppendPlaylist(this.selectedOptions[artist]));
        this.selectedOptions[artist] = [];
        break;
      case 'like':
        break;
    }
  }

  appendToPlaylist (track: Song, artist, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.index = this.tracklist.length;
    track.artistDetails = this.details;
    this.store.dispatch(new AppendPlaylist(track));
  }

  playNow (track: Song, artist, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    track.index = this.tracklist.length;
    track.artistDetails = this.details;
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
    track.artistDetails = this.details[0];
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data: track
    });
  }
  
  onToggleChange(event) {
    if (!this.toggleBackground) {
      this.store.dispatch(new ToggleBackgroundTypeAction(ToggleBackgroundType.USER_VIEWS));
    } else {
      this.store.dispatch(new ToggleBackgroundTypeAction(ToggleBackgroundType.DYNAMIC));
    }
  }

  search(request) {
  }
}
