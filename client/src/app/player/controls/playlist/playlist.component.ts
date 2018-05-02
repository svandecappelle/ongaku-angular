import { Component, OnInit, Inject, OnDestroy, Renderer2, ChangeDetectorRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { Song, IAppState } from '../../../app-state';
import { Store, select } from '@ngrx/store';

import { PlayerAction, PlayerActions } from '../../player-actions';

import {MatDialog, MAT_DIALOG_DATA, MatTableDataSource} from '@angular/material';

import { PlaylistService } from './playlist.service';

@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.component.html',
  styleUrls: ['./playlist.component.scss']
})
export class PlaylistComponent implements OnInit {

  public tracks: Object[];
  public current: Song;

  constructor(public dialog: MatDialog, private store: Store<IAppState>, @Inject(DOCUMENT) private document: Document, private renderer: Renderer2) {

    this.store.select(state => state.trackList).subscribe((val) => {
      this.tracks = val;
    });

    this.store.select(state => state.player).subscribe((val) => {
      if (val.track){
        this.current = val.track;
      }
    });

    this.dialog.afterOpen.subscribe(() => {
      this.renderer.addClass(this.document.body, 'no-scroll');
    });
    this.dialog.afterAllClosed.subscribe(() => {
      this.renderer.removeClass(this.document.body, 'no-scroll');
    });
  }

  ngOnInit() {
  }

  show () {

    this.dialog.open(PlaylistDialogComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
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
  
  public current: Song;
  private store: Store<IAppState>;
  private subscription;
  private dataSource: PlaylistService;

  private displayedColumns = ['state', 'index', 'title', 'artist', 'album', 'duration'];

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private actions: PlayerActions) {
    this.store = this.data.store;
    
    this.dataSource = new PlaylistService();
    this.dataSource.init(this.data.tracklist, this.data.current);

    console.log("nb plays: " + this.data.tracklist.length);
    this.store.select(state => state.player).subscribe((val) => {
      this.current = val.track;
      this.dataSource.playing(this.current);
    });
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim(); // Remove whitespace
    filterValue = filterValue.toLowerCase(); // MatTableDataSource defaults to lowercase matches
    //this.dataSource.filter = filterValue;
  }

  play(track) {
    this.current = track;
    console.log(this.current);
    this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(this.current));
  }

  pause(track) {
    this.current = track;
    console.log(this.current);
    this.store.select(state => state.player).dispatch(this.actions.audioPaused());
  }

  ngOnDestroy() {
    
  }
}