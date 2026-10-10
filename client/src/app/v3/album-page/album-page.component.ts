import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MAT_CHECKBOX_DEFAULT_OPTIONS } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { Song } from '../../app-state';
import { MetadatasComponent } from '../../metadatas/metadatas.component';
import { MaterialModule } from '../../modules/material.module';
import { AlbumService } from '../../services/album.service';
import { PlaybackService } from '../../services/playback.service';
import { formatTime } from '../format-time';

interface AlbumView {
  title: string;
  artist: string;
  cover: string | null;
  year: string | null;
  tracks: Song[];
  /** Raw answer of the API, given to the metadata dialog */
  details: any;
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; album: AlbumView };

/** Album page of the new interface: track list with multiple selection */
@Component({
  selector: 'app-album-page',
  templateUrl: './album-page.component.html',
  styleUrls: ['./album-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
  // The page sets the checked state, to handle Shift+click range selection
  providers: [{ provide: MAT_CHECKBOX_DEFAULT_OPTIONS, useValue: { clickAction: 'noop' } }],
  host: {
    '(document:keydown.escape)': 'clearSelection()',
  },
})
export class AlbumPageComponent {
  readonly playback = inject(PlaybackService);
  private readonly albums = inject(AlbumService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly load = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('album') ?? ''),
      switchMap((name) => this.albums.get(name).pipe(
        map((details): Load => {
          const album = toAlbumView(name, details);
          return album ? { status: 'ready', album } : { status: 'error' };
        }),
        catchError(() => of<Load>({ status: 'error' })),
        startWith<Load>({ status: 'loading' }),
      )),
    ),
    { initialValue: { status: 'loading' } as Load },
  );
  readonly album = computed(() => {
    const load = this.load();
    return load.status === 'ready' ? load.album : null;
  });
  readonly tracks = computed(() => this.album()?.tracks ?? []);
  readonly totalDuration = computed(() => this.tracks().reduce((sum, track) => sum + parseDuration(track['duration']), 0));

  /** Uids of the selected tracks */
  readonly selected = signal<ReadonlySet<unknown>>(new Set());
  readonly selectedTracks = computed(() => this.tracks().filter((track) => this.selected().has(track.uid)));
  readonly allSelected = computed(() => this.tracks().length > 0 && this.selectedTracks().length === this.tracks().length);
  /** Last ticked row, for Shift+click range selection */
  private anchor = -1;

  readonly formatTime = formatTime;

  trackNumber(track: Song, index: number): string {
    const value: any = (track.metadatas as any)?.track;
    const number = typeof value === 'object' && value ? value.no : String(value ?? '').split('/')[0];
    return number ? String(Number(number) || number) : String(index + 1);
  }

  isCurrent(track: Song) {
    return this.playback.current()?.uid === track.uid;
  }

  toggle(track: Song, index: number, event: MouseEvent) {
    const selected = new Set(this.selected());
    const select = !selected.has(track.uid);
    if (event.shiftKey && this.anchor >= 0) {
      const [from, to] = [Math.min(this.anchor, index), Math.max(this.anchor, index)];
      this.tracks().slice(from, to + 1).forEach((t) => (select ? selected.add(t.uid) : selected.delete(t.uid)));
    } else if (select) {
      selected.add(track.uid);
    } else {
      selected.delete(track.uid);
    }
    this.anchor = index;
    this.selected.set(selected);
  }

  toggleAll() {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.tracks().map((track) => track.uid)));
  }

  clearSelection() {
    this.selected.set(new Set());
    this.anchor = -1;
  }

  /** Plays the album from a track, replacing the queue */
  playFrom(index: number) {
    this.replaceQueue(this.withDetails(this.tracks()), index);
  }

  shuffle() {
    const tracks = this.withDetails(this.tracks());
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    this.replaceQueue(tracks, 0);
  }

  playSelection() {
    this.replaceQueue(this.withDetails(this.selectedTracks()), 0);
    this.clearSelection();
  }

  playNext(tracks: Song[]) {
    this.playback.playNext(this.withDetails(tracks));
    this.notify(tracks.length === 1 ? `“${tracks[0].title}” will play next` : `${tracks.length} tracks will play next`);
    this.clearSelection();
  }

  addToQueue(tracks: Song[]) {
    this.playback.append(this.withDetails(tracks));
    this.notify(tracks.length === 1 ? `“${tracks[0].title}” added to the queue` : `${tracks.length} tracks added to the queue`);
    this.clearSelection();
  }

  /** Metadata dialog, for one track or the common tags of several */
  details(tracks: Song[]) {
    const data = tracks.length === 1 ? { ...tracks[0], artistDetails: this.album()?.details[0] } : tracks;
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data,
    });
  }

  private replaceQueue(tracks: Song[], start: number) {
    const previous = this.playback.playList(tracks, start);
    if (previous.tracks.length > 1) {
      // Replacing a queue the user built is easy to do by mistake
      this.snackBar.open(`Queue replaced (${previous.tracks.length} tracks)`, 'Undo', { duration: 6000 })
        .onAction().subscribe(() => this.playback.restore(previous));
    }
  }

  private withDetails(tracks: Song[]): Song[] {
    return tracks.map((track) => ({ ...track, artistDetails: this.album()?.details }));
  }

  private notify(message: string) {
    this.snackBar.open(message, undefined, { duration: 3000 });
  }
}

/** Reads the answer of /api/audio/album/:name (see Library.getAlbum on the server) */
function toAlbumView(name: string, details: any): AlbumView | null {
  const group = details?.[0]?.albums?.[0];
  if (!group?.tracks?.length) {
    return null;
  }
  const info = typeof group.album_info === 'object' && group.album_info ? group.album_info : {};
  const tracks: Song[] = group.tracks;
  const metadatas: any = tracks[0].metadatas ?? {};
  const year = String(metadatas.year ?? metadatas.date ?? '').slice(0, 4) || null;
  return {
    title: group.album ?? name,
    artist: info.artist?.name ?? info.artist ?? tracks[0].artist,
    cover: info.image?.[0] ?? info.cover?.[0] ?? null,
    year,
    tracks,
    details,
  };
}

function parseDuration(value: unknown): number {
  const [minutes, seconds] = String(value ?? '').split(':').map(Number);
  return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : 0;
}
