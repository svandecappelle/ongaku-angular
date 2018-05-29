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
import { PlaylistDialogComponent } from './playlist-dialog.component';

@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.component.html',
  styleUrls: ['./playlist.component.scss']
})
export class PlaylistComponent implements OnInit {

  public tracks: Song[];
  public current: Song;

  /**
   * Constructor
   * @param dialog material details dialog
   * @param store ngrx datastore
   * @param document html document
   * @param renderer html renderer
   */
  constructor(public dialog: MatDialog,
    private store: Store<IAppState>,
    @Inject(DOCUMENT) private document: Document,
    private renderer: Renderer2) {

    this.store.select(state => state.trackList).subscribe((val) => {
      if (!this.tracks) {
        this.current = val[0];
      }
      this.tracks = val;
    });

    this.store.select(state => state.player).subscribe((val) => {
      this.current = val.track;
    });

    this.dialog.afterOpen.subscribe(() => {
      this.renderer.addClass(this.document.body, 'no-scroll');
    });
    this.dialog.afterAllClosed.subscribe(() => {
      this.renderer.removeClass(this.document.body, 'no-scroll');
    });
  }

  /**
   * Init components
   */
  ngOnInit() { }

  /**
   * Show playlist details.
   */
  show() {
    if (!this.current) {
      this.current = this.tracks[0];
    }
    this.dialog.open(PlaylistDialogComponent, {
      width: '90%',
      height: '80%',
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
