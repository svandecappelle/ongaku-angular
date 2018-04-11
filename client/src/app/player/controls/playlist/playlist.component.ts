import { Component, OnInit, Inject } from '@angular/core';
import { Song, IAppState } from '../../../app-state';

import { Store, select } from '@ngrx/store';

import {MatDialog, MAT_DIALOG_DATA} from '@angular/material';


@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.component.html',
  styleUrls: ['./playlist.component.scss']
})
export class PlaylistComponent implements OnInit {

  public tracks: Object[];

  constructor(public dialog: MatDialog, private store: Store<IAppState>) {
    this.store.select(state => state.trackList).subscribe((val) => {
      console.log("tracklist changed");
      console.log(val);
      this.tracks = val;
    });
  }

  ngOnInit() {
  }

  show () {
    this.dialog.open(PlaylistDialogComponent, {
      data: {
        tracklist: this.tracks
      }
    });
  }
}

@Component({
  selector: 'playlist-dialog',
  templateUrl: 'playlist-dialog.html',
})
export class PlaylistDialogComponent {
  
  public tracklist: Object[];
  
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {
    this.tracklist = data.tracklist;
  }
}