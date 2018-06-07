import { Component, OnInit } from '@angular/core';

import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { Router }  from '@angular/router';

import { MatDialog } from '@angular/material';

import { Song, IAppState } from '../app-state';
import {
  AppendPlaylist
} from '../player/state';

import { Store, Action, select } from '@ngrx/store';

import { AudioService } from '../audio.service';
import { Observable } from 'rxjs/Rx';

import { PlayerActions } from '../player/player-actions';
import { MetadatasComponent } from '../metadatas/metadatas.component';
import { searchReducer } from '../header/search-reducer';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public artists = [];
  public albums = [];

  public _page = {
    artist: 0,
    album: 0
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

  constructor(private _audioService: AudioService,
    private _sanitizer: DomSanitizer,
    private store: Store<IAppState>,
    public dialog: MatDialog,
    private actions: PlayerActions,
    private router: Router) {
    this._page.artist = 0;
    this._page.album = 0;
  }

  ngOnInit() {
    this.store.select(state => state.search).subscribe((val) => {
      this.search(val);
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
              this.images.artists[artist.name] = this.getImageSrc(artist.info);
            });
            this.artists = this.artists.concat(data);
            break;
          case 'album':
            data.forEach(album => {
              this.images.albums[album.name] = this.getImageSrc(album.info);
            });
            this.albums = this.albums.concat(data);
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
    const image = src.image ? src.image[3]['#text'] : '';

    return this._sanitizer.bypassSecurityTrustUrl(`${image}`);
  }

  search(criterion) {
    this._page.artist = 0;
    this._page.album = 0;

    this.artists = [];
    this.albums = [];
    this._audioService.filter = criterion;
    this.loadMore('artist');
    this.loadMore('album');
  }

  openArtistDetail(artist) {
    this.router.navigate(['artist', artist]);
  }

}
