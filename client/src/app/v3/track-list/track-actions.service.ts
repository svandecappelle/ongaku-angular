import { Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Song } from '../../app-state';
import { MetadatasComponent } from '../../metadatas/metadatas.component';
import { PlaybackService } from '../../services/playback.service';

/**
 * Selection and actions on the tracks of a page. Provided by each page
 * (`providers: [TrackActions]`), and shared by its track lists and its
 * selection bar, so a selection can span several lists.
 */
@Injectable()
export class TrackActions {
  private readonly playback = inject(PlaybackService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Every track of the page, in display order */
  private readonly pageTracks = signal<Song[]>([]);
  private readonly selectedUids = signal<ReadonlySet<unknown>>(new Set());
  /** Last ticked track, for Shift+click range selection */
  private anchor: unknown = null;
  /** Given to the tracks sent to the player (artist details for the metadata dialog) */
  private pageDetails: unknown = null;

  readonly selected = computed(() => this.pageTracks().filter((track) => this.selectedUids().has(track.uid)));

  setPage(tracks: Song[], details: unknown) {
    this.pageTracks.set(tracks);
    this.pageDetails = details;
    this.clear();
  }

  isSelected(track: Song) {
    return this.selectedUids().has(track.uid);
  }

  toggle(track: Song, range: boolean) {
    const selected = new Set(this.selectedUids());
    const select = !selected.has(track.uid);
    const tracks = this.pageTracks();
    const from = tracks.findIndex((t) => t.uid === this.anchor);
    const to = tracks.findIndex((t) => t.uid === track.uid);
    const group = range && from >= 0 ? tracks.slice(Math.min(from, to), Math.max(from, to) + 1) : [track];
    group.forEach((t) => (select ? selected.add(t.uid) : selected.delete(t.uid)));
    this.anchor = track.uid;
    this.selectedUids.set(selected);
  }

  /** Selects the tracks of a list, or unselects them when they all are */
  toggleAll(tracks: Song[]) {
    const selected = new Set(this.selectedUids());
    const all = tracks.every((track) => selected.has(track.uid));
    tracks.forEach((track) => (all ? selected.delete(track.uid) : selected.add(track.uid)));
    this.selectedUids.set(selected);
  }

  clear() {
    this.selectedUids.set(new Set());
    this.anchor = null;
  }

  /** Replaces the queue with the tracks and plays one of them, with an undo */
  playFrom(tracks: Song[], start = 0) {
    const previous = this.playback.playList(this.withDetails(tracks), start);
    if (previous.tracks.length > 1) {
      // Replacing a queue the user built is easy to do by mistake
      this.snackBar.open(`Queue replaced (${previous.tracks.length} tracks)`, 'Undo', { duration: 6000 })
        .onAction().subscribe(() => this.playback.restore(previous));
    }
    this.clear();
  }

  shuffle(tracks: Song[]) {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.playFrom(shuffled);
  }

  playNext(tracks: Song[]) {
    this.playback.playNext(this.withDetails(tracks));
    this.notify(tracks.length === 1 ? `“${tracks[0].title}” will play next` : `${tracks.length} tracks will play next`);
    this.clear();
  }

  addToQueue(tracks: Song[]) {
    this.playback.append(this.withDetails(tracks));
    this.notify(tracks.length === 1 ? `“${tracks[0].title}” added to the queue` : `${tracks.length} tracks added to the queue`);
    this.clear();
  }

  /** Metadata dialog, for one track or the common tags of several */
  details(tracks: Song[]) {
    this.dialog.open(MetadatasComponent, {
      width: '80%',
      hasBackdrop: true,
      panelClass: 'custom-overlay-pane-class',
      data: tracks.length === 1 ? this.withDetails(tracks)[0] : tracks,
    });
  }

  private withDetails(tracks: Song[]): Song[] {
    return tracks.map((track) => ({ ...track, artistDetails: this.pageDetails as object }));
  }

  private notify(message: string) {
    this.snackBar.open(message, undefined, { duration: 3000 });
  }
}
