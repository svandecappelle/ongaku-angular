import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  Renderer2,
  ChangeDetectorRef,
  ViewChild,
  ElementRef
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Observable } from 'rxjs/Observable';
import { Store, select } from '@ngrx/store';
import { MatDialog, MAT_DIALOG_DATA, MatTableDataSource } from '@angular/material';

import { Song, IAppState } from '../../../app-state';
import { PlayerAction, PlayerActions } from '../../player-actions';
import { PlaylistService } from './playlist.service';
import { PlaylistDialogComponent } from './playlist-dialog.component';

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
      if (val.track) {
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

  show() {

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
