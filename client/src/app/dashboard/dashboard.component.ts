import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';

import {AudioService} from './audio.service';
import {Observable} from 'rxjs/Rx';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  public artists = [];
  public _page;

  constructor(private _audioService: AudioService, private _sanitizer: DomSanitizer) { 
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
    return this._sanitizer.bypassSecurityTrustStyle(`linear-gradient(rgba(29, 29, 29, 0), rgba(16, 16, 23, 0.5)), url(${src})`);;
  }

}
