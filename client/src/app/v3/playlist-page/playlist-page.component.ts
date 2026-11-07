import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';
import { Playlist, PlaylistsService } from '../../services/playlists.service';
import { formatTime } from '../format-time';
import { PlaylistCoverComponent } from '../playlists/playlist-cover.component';
import { PlaylistUi } from '../playlists/playlist-ui.service';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';
import { TrackActions } from '../track-list/track-actions.service';
import { TrackListComponent } from '../track-list/track-list.component';
import { parseDuration } from '../track-list/tracks';

type Load = { status: 'loading' } | { status: 'error'; notFound: boolean } | { status: 'ready' };

/** A playlist: play it, reorder or remove its tracks, rename or delete it */
@Component({
  selector: 'app-playlist-page',
  templateUrl: './playlist-page.component.html',
  styleUrls: ['./playlist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, TrackListComponent, SelectionBarComponent, PlaylistCoverComponent],
  providers: [TrackActions],
})
export class PlaylistPageComponent {
  readonly actions = inject(TrackActions);
  private readonly playlists = inject(PlaylistsService);
  private readonly ui = inject(PlaylistUi);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly load = signal<Load>({ status: 'loading' });
  readonly playlist = signal<Playlist | null>(null);
  readonly tracks = computed(() => this.playlist()?.tracks ?? []);
  readonly totalDuration = computed(() => this.tracks().reduce((sum, track) => sum + parseDuration(track), 0));
  /** A change is being saved */
  readonly saving = signal(false);

  readonly formatTime = formatTime;

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('name') ?? ''),
      switchMap((name) => {
        this.load.set({ status: 'loading' });
        return this.playlists.get(name).pipe(catchError((err: HttpErrorResponse) => of(err)));
      }),
      takeUntilDestroyed(),
    ).subscribe((answer) => {
      if (answer instanceof HttpErrorResponse) {
        this.playlist.set(null);
        this.load.set({ status: 'error', notFound: answer.status === 404 });
      } else {
        this.show(answer);
        this.load.set({ status: 'ready' });
      }
    });
    this.actions.remover.set({ label: 'Remove from this playlist', remove: (tracks) => this.removeTracks(tracks) });
  }

  move({ from, to }: { from: number; to: number }) {
    const tracks = [...this.tracks()];
    tracks.splice(to, 0, ...tracks.splice(from, 1));
    this.save(tracks, 'The new order could not be saved');
  }

  removeTracks(removed: Song[]) {
    const previous = this.tracks();
    const uids = new Set(removed.map((track) => track.uid));
    this.save(previous.filter((track) => !uids.has(track.uid)), 'The tracks could not be removed', () => {
      const what = removed.length === 1 ? `“${removed[0].title}”` : `${removed.length} tracks`;
      this.snackBar.open(`${what} removed from the playlist`, 'Undo', { duration: 5000 })
        .onAction().subscribe(() => this.save(previous, 'The tracks could not be restored'));
    });
  }

  rename() {
    const playlist = this.playlist();
    if (playlist) {
      this.ui.rename(playlist.name).subscribe((renamed) => {
        this.show(renamed);
        this.router.navigate(['/playlists', renamed.name], { replaceUrl: true });
      });
    }
  }

  remove() {
    const playlist = this.playlist();
    if (playlist) {
      this.ui.remove(playlist).subscribe(() => this.router.navigate(['/playlists']));
    }
  }

  private show(playlist: Playlist) {
    this.playlist.set(playlist);
    this.actions.setPage(playlist.tracks, null);
  }

  /** Shows the new tracks at once and saves them; reverts on failure */
  private save(tracks: Song[], failure: string, done?: () => void) {
    const playlist = this.playlist();
    if (!playlist) {
      return;
    }
    this.show({ ...playlist, tracks, count: tracks.length });
    this.saving.set(true);
    this.playlists.setTracks(playlist.name, tracks).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.show(saved);
        done?.();
      },
      error: () => {
        this.saving.set(false);
        this.show(playlist);
        this.snackBar.open(failure, undefined, { duration: 5000 });
      },
    });
  }
}
