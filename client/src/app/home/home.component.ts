import { Component, OnInit } from '@angular/core';

import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';

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
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {

  public artists = [];
  public albums = [];
  public trackList = [];
  public breakpoint: number = 5;

  public _page = {
    artist: 0,
    album: 0,
    tracks: 0
  };
  private selectedOptions = [];
  private loading: Object = {
    artist: true,
    album: true
  };
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
    private actions: PlayerActions,
    private router: Router) {
    this._page.artist = 0;
    this._page.album = 0;
    this._page.tracks = 0;
  }

  ngOnInit() {
    this.breakpoint = (window.innerWidth <= 400) ? 1 : 5;
    this.subscriptions.push(this.store.select(state => state.search).subscribe((val) => {
      this.search(val);
    }));
  }

  onResize(event) {
    this.breakpoint = (event.target.innerWidth <= 400) ? 1 : event.target.innerWidth / 250;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(subscribe => {
      subscribe.unsubscribe();
    });
  }

  loadMore (type) {
    this.loading[type] = true;
    this._audioService.get(type, this._page[type]).subscribe(
      data => {
        this.loading[type] = false;

        switch (type) {
          case 'artist':
            data.forEach(artist => {
              this.images.artists[artist.name] = `/api/audio/static/covers/${artist.name}/cover.jpg`;
            });
            this.artists = this.artists.concat(data);
            break;
          case 'album':
            data.forEach(album => {
              this.images.albums[album.name] = this.getImageSrc(album.info);
            });
            this.albums = this.albums.concat(data);
            break;
          case 'tracks':
            this.trackList = this.trackList.concat(data);
            break;
        }
      },
      err => {
        this.loading[type] = false;
        console.error(err);
      },
      () => this.loading[type] = false
    );

    this._page[type] += 1;
  }

  getImageSrc(src) {
    let image = src.image ? src.image[0] : '/static/img/album.jpg';
    return this._sanitizer.bypassSecurityTrustUrl(`${image}`);
  }

  search(criterion) {
    this._page.artist = 0;
    this._page.album = 0;
    this._page.tracks = 0;

    this.artists = [];
    this.albums = [];
    this.trackList = [];
    this._audioService.filter = criterion;
    this.loadMore('artist');
    this.loadMore('album');
    this.loadMore('tracks');
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
    this.store.dispatch(this.actions.playSelectedTrack(track));
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

  actionFrom (action) {
    switch (action) {
      case 'play':
        this.store.dispatch(new AppendPlaylist(this.selectedOptions));
        this.selectedOptions = [];
        break;
      case 'like':
        break;
      case 'metadata':
        event.preventDefault();
        event.stopPropagation();
        let tracks = this.selectedOptions;
        this.dialog.open(MetadatasComponent, {
          width: '80%',
          hasBackdrop: true,
          panelClass: 'custom-overlay-pane-class',
          data: tracks
        });
        break;
    }
  }

  selectAll() {
    console.log(this.trackList.length);
    console.log(this.selectedOptions.length);
    if (this.trackList.length > this.selectedOptions.length) {
      this.selectedOptions = this.trackList;
    } else {
      this.selectedOptions = [];
    }
  }

  openArtistDetail(artist) {
    this.router.navigate(['artist', artist]);
  }

  openAlbumDetail(album) {
    this.router.navigate(['album', album.info && album.info.mbid ? album.name : album.name]);
  }

}
