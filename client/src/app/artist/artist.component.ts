import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { MatDialog } from '@angular/material';

import { Song, IAppState } from '../app-state';
import {
  AppendPlaylist
} from '../player/state';

import { Store, Action, select } from '@ngrx/store';
import { Observable } from 'rxjs/Rx';

import { PlayerActions } from '../player/player-actions';
import { MetadatasComponent } from '../metadatas/metadatas.component';

import { ArtistService } from './artist.service';

@Component({
  selector: 'app-artist',
  templateUrl: './artist.component.html',
  styleUrls: ['./artist.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ArtistComponent implements OnInit {

  private artist: string;
  private details: Object;
  private image;

  public tracklist = [];

  private selectedOptions = [];
  private covers: Object = {};

  private _albumsIdCounter: number = 0;

  constructor(
    private activatedRoute: ActivatedRoute,
    private service: ArtistService,
    private _sanitizer: DomSanitizer,
    private store: Store<IAppState>,
    public dialog: MatDialog,
    private actions: PlayerActions) { }

  ngOnInit() {
    // subscribe to router event
    this.activatedRoute.params.subscribe((params: Params) => {
      this.artist = params['artist'];

      this.service.get(this.artist).subscribe((details) => {
        details.artist_info = details.info;
        this.details = details;
        if (details) {
          this.image = this.getImageSrc(details.info);
          details.albums.forEach(album => {
            this.covers[album.album_info.title] = this.getImageSrc(album.album_info);
          });
        }
      });
    });
  }

  getArtistBackground(src) {
    const image = src.image ? src.image[3]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${image})`);
  }

  getImageSrc(src) {
    const image = src.image ? src.image[3]['#text'] : '';

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
    track.artistDetails = this.details;
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data: track
    });
  }

  scrollLink(target) {
    if (target){
      return target.replace(new RegExp(' ', 'g'), '_');      
    }

    this._albumsIdCounter += 1;
    return this._albumsIdCounter.toString();
  }
}
