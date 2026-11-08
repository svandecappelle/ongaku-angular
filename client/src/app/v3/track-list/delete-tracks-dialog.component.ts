import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';

/** Confirms the deletion of track files; closes with true */
@Component({
  selector: 'app-delete-tracks-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  template: `
    <h2 mat-dialog-title>Delete {{ tracks.length === 1 ? '“' + tracks[0].title + '”' : tracks.length + ' tracks' }}?</h2>
    <mat-dialog-content class="content">
      <p>The {{ tracks.length === 1 ? 'file is' : 'files are' }} deleted from the server. This cannot be undone.</p>
      <p class="muted">
        Other copies of the same {{ tracks.length === 1 ? 'track' : 'tracks' }} you may delete go too.
        {{ tracks.length === 1 ? 'It leaves' : 'They leave' }} the libraries, likes and playlists of every user.
      </p>
      @if (tracks.length > 1) {
        <ul class="list">
          @for (track of tracks.slice(0, 8); track track.uid) {
            <li>{{ track.title }} <span class="muted">· {{ track.artist }}</span></li>
          }
          @if (tracks.length > 8) {
            <li class="muted">and {{ tracks.length - 8 }} more</li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close cdkFocusInitial>Cancel</button>
      <button mat-flat-button type="button" class="danger" [mat-dialog-close]="true">
        <mat-icon>delete_forever</mat-icon>
        Delete
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .content {
      max-width: 460px;
    }
    p {
      margin: 0 0 12px;
    }
    .muted {
      color: var(--ongaku-muted);
    }
    .list {
      margin: 0;
      padding-left: 20px;
    }
    .danger {
      color: #fff;
      background: var(--mat-sys-error, #d32f2f);
    }
  `],
})
export class DeleteTracksDialogComponent {
  readonly tracks = inject<Song[]>(MAT_DIALOG_DATA);
}
