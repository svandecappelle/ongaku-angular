import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { MatDialog } from '@angular/material';

import { Song, IAppState } from '../app-state';
import { AppendPlaylist } from '../player/state';
import { ToggleBackgroundTypeAction, ToggleBackgroundType } from '../content/content-state';

import { Store, Action, select } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs';

import { PlayerActions } from '../player/player-actions';
import { MetadatasComponent } from '../metadatas/metadatas.component';

import { ArtistService } from './artist.service';

@Component({
  selector: 'app-artist',
  templateUrl: './artist.component.html',
  styleUrls: ['./artist.component.scss']
})
export class ArtistComponent implements OnInit {

  public tracklist = [];

  private selectedOptions = [];
  private covers: Object = {};

  private _albumsIdCounter = 0;

  public subscriptions = new Array<Subscription>();

  details: Object;
  toggleBackground = true;
  artist: string;
  image;

  constructor(
    private activatedRoute: ActivatedRoute,
    private service: ArtistService,
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

    this.subscriptions.push(this.store.select(state => state.showBackgroundOnViews).subscribe((val) => {
      this.toggleBackground = !val;
    }));

    // subscribe to router event
    this.activatedRoute.params.subscribe((params: Params) => {
      this.artist = params['artist'];

      this.subscriptions.push(this.service.get(this.artist).subscribe((details) => {
        details.artist_info = details.info;
        this.details = details;
        if (details) {
          this.image = `/api/audio/static/covers/${this.artist}/cover.jpg`;
          details.albums.forEach(album => {
            this.covers[album.album_info.title] = this.getImageSrc(album.album_info);
          });
        }
      }));
    });
  }

  OnDestroy() {
    this.subscriptions.forEach(subscribe => {
      subscribe.unsubscribe();
    });
  }

  onToggleChange(event) {
    if (!this.toggleBackground) {
      this.store.dispatch(new ToggleBackgroundTypeAction(ToggleBackgroundType.USER_VIEWS));
    } else {
      this.store.dispatch(new ToggleBackgroundTypeAction(ToggleBackgroundType.DYNAMIC));
    }
  }

  saveImageServerSide() {
    this.service.saveImage(this.artist).subscribe(() => {});
  }

  getArtistBackground(src) {
    let image = src.image[0];
    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url('${image}')`);
  }

  getBackground(src) {
    let image = src.image[0];
    console.log(src.image[0]);
    return this._sanitizer.bypassSecurityTrustStyle(`url('${image}')`);
  }

  getImageSrc(src) {
    let image = src.image[0];
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
    track.artistDetails = this.details;
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data: track
    });
  }

  scrollLink(target) {
    if (target) {
      return target.replace(new RegExp(' ', 'g'), '_');
    }

    this._albumsIdCounter += 1;
    return this._albumsIdCounter.toString();
  }

  search(request) {
    
  }
}
