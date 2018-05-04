import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { MatDialog } from '@angular/material';

import { Song, IAppState, Append } from '../app-state';

import { Store, Action, select } from '@ngrx/store';

import { AudioService } from './audio.service';
import { Observable } from 'rxjs/Rx';

import { MetadatasComponent } from './metadatas/metadatas.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  public artists = [];
  public _page;
  private selectedOptions = [];

  constructor(private _audioService: AudioService, private _sanitizer: DomSanitizer, private store: Store<IAppState>, public dialog: MatDialog) { 
    this._page = 0;
  }

  ngOnInit() {
    this.loadMore();
  }

  loadMore(){
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

    this.store.dispatch(new Append(this.selectedOptions[artist]));
    this.selectedOptions[artist] = [];
  }

  selectAll(artist, album){
    if (!this.selectedOptions[artist] || album.tracks.length > this.selectedOptions[artist].length){
      this.selectedOptions[artist] = album.tracks;
    } else {
      this.selectedOptions[artist] = [];
    }
  }

  metadata(track: Song, event:Event){
    event.preventDefault();
    event.stopPropagation();
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data: track
    });
  }

  onTracksSelectionChanged(tracks){
    // console.log(tracks);
    // console.log(this.selectedOptions)
  }
}
