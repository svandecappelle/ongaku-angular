import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, Observable } from 'rxjs';
import { catchError, filter, switchMap, tap } from 'rxjs/operators';

import { Song } from '../../app-state';
import { Playlist, PlaylistsService } from '../../services/playlists.service';
import { PlaylistNameDialogComponent, PlaylistNameDialogData } from './playlist-name-dialog.component';

/** Playlist actions with their dialogs and notifications, shared by the menus and the pages */
@Injectable({ providedIn: 'root' })
export class PlaylistUi {
  private readonly playlists = inject(PlaylistsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  /** Asks a name and creates a playlist holding the tracks; `open` shows it once created */
  create(tracks: Song[] = [], open = false): Observable<Playlist> {
    return this.askName({ count: tracks.length }).pipe(
      switchMap((name) => this.playlists.create(name, tracks).pipe(this.reportErrors('The playlist could not be created'))),
      tap((playlist) => {
        if (open) {
          this.router.navigate(['/playlists', playlist.name]);
          this.snackBar.open(`Playlist “${playlist.name}” created`, undefined, { duration: 3000 });
        } else {
          this.notify(`Playlist “${playlist.name}” created`, playlist.name);
        }
      }),
    );
  }

  add(name: string, tracks: Song[]): Observable<Playlist> {
    return this.playlists.add(name, tracks).pipe(
      this.reportErrors('The playlist could not be updated'),
      tap((playlist) => {
        const added = playlist.added ?? tracks.length;
        const what = tracks.length === 1 ? `“${tracks[0].title}”` : `${added} ${added > 1 ? 'tracks' : 'track'}`;
        this.notify(added ? `${what} added to “${name}”` : `Already in “${name}”`, name);
      }),
    );
  }

  /** Asks the new name; emits the renamed playlist */
  rename(name: string): Observable<Playlist> {
    return this.askName({ name }).pipe(
      filter((newName) => newName !== name),
      switchMap((newName) => this.playlists.rename(name, newName).pipe(this.reportErrors('The playlist could not be renamed'))),
    );
  }

  /** Deletes the playlist, with an undo that saves it again */
  remove(playlist: Playlist): Observable<unknown> {
    return this.playlists.remove(playlist.name).pipe(
      this.reportErrors('The playlist could not be deleted'),
      tap(() => this.snackBar.open(`Playlist “${playlist.name}” deleted`, 'Undo', { duration: 6000 }).onAction()
        .pipe(switchMap(() => this.playlists.create(playlist.name, playlist.tracks)))
        .subscribe(() => this.router.navigate(['/playlists', playlist.name]))),
    );
  }

  private askName(data: PlaylistNameDialogData): Observable<string> {
    return this.dialog.open<PlaylistNameDialogComponent, PlaylistNameDialogData, string>(PlaylistNameDialogComponent, { data })
      .afterClosed().pipe(filter((name): name is string => !!name));
  }

  /** Shows the server message and completes without a value */
  private reportErrors<T>(fallback: string) {
    return (source: Observable<T>) => source.pipe(catchError((err: HttpErrorResponse) => {
      this.snackBar.open(err.error?.message || fallback, undefined, { duration: 5000 });
      return EMPTY;
    }));
  }

  private notify(message: string, name: string) {
    const onPage = this.router.url.split('?')[0] === `/playlists/${encodeURIComponent(name)}`;
    this.snackBar.open(message, onPage ? undefined : 'Open', { duration: 4000 })
      .onAction().subscribe(() => this.router.navigate(['/playlists', name]));
  }
}
