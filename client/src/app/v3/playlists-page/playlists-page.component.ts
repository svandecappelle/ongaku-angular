import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MaterialModule } from '../../modules/material.module';
import { PlaylistSummary, PlaylistsService } from '../../services/playlists.service';
import { formatTime } from '../format-time';
import { PlaylistCoverComponent } from '../playlists/playlist-cover.component';
import { PlaylistUi } from '../playlists/playlist-ui.service';
import { TrackActions } from '../track-list/track-actions.service';

type Load = 'loading' | 'error' | 'ready';

/** Playlists of the user, as tiles */
@Component({
  selector: 'app-playlists-page',
  templateUrl: './playlists-page.component.html',
  styleUrls: ['./playlists-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, FormsModule, PlaylistCoverComponent],
  providers: [TrackActions],
})
export class PlaylistsPageComponent {
  private readonly playlists = inject(PlaylistsService);
  private readonly ui = inject(PlaylistUi);
  private readonly actions = inject(TrackActions);

  readonly status = signal<Load>('loading');
  readonly search = signal('');
  readonly list = computed(() => this.playlists.playlists());
  readonly filtered = computed(() => {
    const search = this.search().trim().toLowerCase();
    return search ? this.list().filter((playlist) => playlist.name.toLowerCase().includes(search)) : this.list();
  });

  readonly formatTime = formatTime;

  constructor() {
    this.load();
  }

  load() {
    this.status.set('loading');
    this.playlists.all().subscribe({
      next: () => this.status.set('ready'),
      error: () => this.status.set('error'),
    });
  }

  create() {
    this.ui.create([], true).subscribe();
  }

  play(playlist: PlaylistSummary) {
    this.playlists.get(playlist.name).subscribe((full) => {
      if (full.tracks.length) {
        this.actions.playFrom(full.tracks);
      }
    });
  }

  subtitle(playlist: PlaylistSummary) {
    const tracks = `${playlist.count} ${playlist.count === 1 ? 'track' : 'tracks'}`;
    return playlist.duration ? `${tracks} · ${this.formatTime(playlist.duration)}` : tracks;
  }
}
