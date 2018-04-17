import { Component, OnInit, Inject, OnDestroy } from '@angular/core';
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
  public current: Object;

  constructor(public dialog: MatDialog, private store: Store<IAppState>) {
    this.store.select(state => state.trackList).subscribe((val) => {
      this.tracks = val;
    });

    this.store.select(state => state.player).subscribe((val) => {
      this.current = val.track;
    });
  }

  ngOnInit() {
  }

  show () {
    this.dialog.open(PlaylistDialogComponent, {
      width: '80%',
      data: {
        tracklist: this.tracks, 
        current: this.current,
        store: this.store
      }
    });
  }
}

@Component({
  selector: 'playlist-dialog',
  templateUrl: 'playlist-dialog.html',
  styleUrls: ['./playlist-dialog.component.scss']
})
export class PlaylistDialogComponent implements OnDestroy {
  
  public tracklist: Object[];
  public current: Object;
  private store: Store<IAppState>;
  private subscription;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {
    this.tracklist = data.tracklist;
    this.current = data.current;
    this.store = data.store;

    this.store.select(state => state.player).subscribe((val) => {
      this.current = val.track;
    });
  }

  ngOnDestroy() {
    
  }
}