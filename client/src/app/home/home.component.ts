import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';

import { Song, IAppState } from '../app-state';
import {
  AppendPlaylist
} from '../player/state'

import { Store, Action, select } from '@ngrx/store';

import {AudioService} from './audio.service';
import {Observable} from 'rxjs/Rx';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public artists = [];
  public _page;
  private selectedOptions = [];

  constructor(private _audioService: AudioService, private _sanitizer: DomSanitizer, private store: Store<IAppState>) { 
    this._page = 0;
  }

  ngOnInit() {
    this.loadMore();
  }

  loadMore(){
    console.log("load");
    this._audioService.getArtists(this._page).subscribe(
      data => { this.artists = this.artists.concat(data) },
      err => console.error(err),
      () => console.log('done loading artists')
    );

    this._page +=1;
  }

  getImage (src) {
    let image = src.image ? src.image[1]['#text'] : "";

    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${image})`);;
  }

  actionFrom (action, artist) {
    switch (action){
      case 'play':
        break;
      case 'like':
        break
    }

    this.store.dispatch(new AppendPlaylist(this.selectedOptions[artist]));
    this.selectedOptions[artist] = [];
  }

  selectAll(artist, album){
    if (!this.selectedOptions[artist] || album.tracks.length > this.selectedOptions[artist].length){
      this.selectedOptions[artist] = album.tracks;
    } else {
      this.selectedOptions[artist] = [];
    }
    
  }

  onTracksSelectionChanged(tracks){
    // console.log(tracks);
    // console.log(this.selectedOptions)
  }
}
