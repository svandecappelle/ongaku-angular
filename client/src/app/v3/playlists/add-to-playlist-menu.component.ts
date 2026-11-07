import { ChangeDetectionStrategy, Component, inject, input, output, viewChild } from '@angular/core';
import { MatMenu } from '@angular/material/menu';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';
import { PlaylistsService } from '../../services/playlists.service';
import { PlaylistUi } from './playlist-ui.service';

/**
 * "Add to playlist" menu: the user's playlists and "New playlist…". Opened by a
 * trigger elsewhere: `<app-add-to-playlist-menu #pl [tracks]="…" />` then
 * `[matMenuTriggerFor]="pl.menu()"`, also as a sub menu.
 */
@Component({
  selector: 'app-add-to-playlist-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  template: `
    <mat-menu #menu="matMenu" class="playlist-menu">
      <button mat-menu-item (click)="create()">
        <mat-icon>add</mat-icon>
        <span>New playlist…</span>
      </button>
      @if (playlists.playlists().length) {
        <mat-divider></mat-divider>
      }
      @for (playlist of playlists.playlists(); track playlist.name) {
        <button mat-menu-item (click)="add(playlist.name)">
          <mat-icon>queue_music</mat-icon>
          <span>{{ playlist.name }}</span>
        </button>
      }
    </mat-menu>
  `,
})
export class AddToPlaylistMenuComponent {
  readonly playlists = inject(PlaylistsService);
  private readonly ui = inject(PlaylistUi);

  readonly tracks = input.required<Song[]>();
  /** Emitted once the tracks are saved */
  readonly done = output<void>();

  readonly menu = viewChild.required<MatMenu>('menu');

  create() {
    this.ui.create(this.tracks()).subscribe(() => this.done.emit());
  }

  add(name: string) {
    this.ui.add(name, this.tracks()).subscribe(() => this.done.emit());
  }
}
