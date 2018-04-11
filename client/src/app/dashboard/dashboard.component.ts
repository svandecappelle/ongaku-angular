import { Component, OnInit } from '@angular/core';

import {AudioService} from './audio.service';
import {Observable} from 'rxjs/Rx';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {

  public artists = [];
  public _page;

  constructor(private _audioService: AudioService) { 
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

}
