import { Component, OnInit } from '@angular/core';

import {AudioService} from './audio.service';
import {Observable} from 'rxjs/Rx';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {

  public artists;

  constructor(private _audioService: AudioService) { }

  ngOnInit() {
    this._audioService.getArtists().subscribe(
      data => { this.artists = data},
      err => console.error(err),
      () => console.log('done loading artists')
    );
  }

}
