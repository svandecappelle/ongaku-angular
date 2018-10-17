import { Component, OnInit } from '@angular/core';

import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { MatDialog } from '@angular/material';

import { Song, IAppState } from '../../app-state';
import {
  AppendPlaylist
} from '../../player/state';

import { Store, Action, select } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs/Rx';

import { PlayerActions } from '../../player/player-actions';
import { MetadatasComponent } from '../../metadatas/metadatas.component';

import { AlbumService } from './album.service';


@Component({
  selector: 'app-album',
  templateUrl: './album.component.html',
  styleUrls: ['./album.component.scss']
})
export class AlbumComponent implements OnInit {

  private album: string; 
  private details: Object;
  private image;

  public tracklist = [];

  private selectedOptions = [];
  private covers: Object = {};

  private _albumsIdCounter: number = 0;
  
  public subscriptions = new Array<Subscription>();

  constructor(
    private activatedRoute: ActivatedRoute,
    private service: AlbumService,
    private _sanitizer: DomSanitizer,
    private store: Store<IAppState>,
    public dialog: MatDialog,
    private actions: PlayerActions) { }

  ngOnInit() {
    this.subscriptions.push(this.store.select(state => state.trackList).subscribe((val) => {
      this.tracklist = val;
    }));

    this.subscriptions.push(this.store.select(state => state.search).subscribe((val) => {
      this.search(val);
    }));

    this.activatedRoute.params.subscribe((params: Params) => {
      this.album = params['album'];

      this.subscriptions.push(this.service.get(this.album).subscribe((details) => {
        details.artist_info = {
          bio: ""
        };
        this.details = details;
        this.image = this.getImageSrc();
      }));
    });

  }


  ngOnDestroy() {
    this.subscriptions.forEach(subscribe => {
      subscribe.unsubscribe();
    });
  }

  getAlbumBackground() {
    const src = this.details[0].albums[0].album_info;
    let image;
    if (src.image && src.image.length > 1) {
      image = src.image ? src.image[3]['#text'] : '';
    } else if (src.image) {
      image = src.image ? src.image[0]['#text'] : '';
    }
    
    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${image})`);
  }

  getImageSrc() {
    const src = this.details[0].albums[0].album_info;
    let image;
    if (src.image && src.image.length > 1) {
      image = src.image ? src.image[3]['#text'] : '';
    } else if (src.image) {
      image = src.image ? src.image[0]['#text'] : '';
    }
    return this._sanitizer.bypassSecurityTrustUrl(`${image}`);
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
    this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(track));
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

  search(request) {
    console.log("search " + requestAnimationFrame);
  }
}
