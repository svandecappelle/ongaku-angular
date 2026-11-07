import { Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Song } from '../../app-state';
import { MetadatasComponent } from '../../metadatas/metadatas.component';
import { PlaybackService } from '../../services/playback.service';
import { MyLibraryService } from '../../services/my-library.service';
import { LikesService } from '../../services/likes.service';

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
  private readonly library = inject(MyLibraryService);
  private readonly likes = inject(LikesService);

  /** Every track of the page, in display order */
  private readonly pageTracks = signal<Song[]>([]);
  private readonly selectedUids = signal<ReadonlySet<unknown>>(new Set());
  /** Last ticked track, for Shift+click range selection */
  private anchor: unknown = null;
  /** Given to the tracks sent to the player (artist details for the metadata dialog) */
  private pageDetails: unknown = null;

  readonly selected = computed(() => this.pageTracks().filter((track) => this.selectedUids().has(track.uid)));
  /** Set by a playlist page: removes tracks from the playlist (menu and selection bar entry) */
  readonly remover = signal<{ label: string; remove: (tracks: Song[]) => void } | null>(null);

  /** Sets the tracks of the page; the selected tracks still on the page stay selected */
  setPage(tracks: Song[], details: unknown) {
    this.pageTracks.set(tracks);
    this.pageDetails = details;
    const uids = new Set<unknown>(tracks.map((track) => track.uid));
    this.selectedUids.update((selected) => new Set([...selected].filter((uid) => uids.has(uid))));
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

  inLibrary(track: Song) {
    return this.library.has(track);
  }

  allInLibrary(tracks: Song[]) {
    return tracks.length > 0 && tracks.every((track) => this.library.has(track));
  }

  /** Adds the tracks to "My library", or removes them when they all are in it */
  toggleLibrary(tracks: Song[]) {
    const remove = this.allInLibrary(tracks);
    const count = tracks.length === 1 ? `“${tracks[0].title}”` : `${tracks.length} tracks`;
    (remove ? this.library.remove(tracks) : this.library.add(tracks)).subscribe({
      next: () => this.snackBar.open(`${count} ${remove ? 'removed from' : 'added to'} your library`, 'Undo', { duration: 5000 })
        .onAction().subscribe(() => (remove ? this.library.add(tracks) : this.library.remove(tracks)).subscribe()),
      error: () => this.notify('Your library could not be updated'),
    });
    this.clear();
  }

  removeFromPage(tracks: Song[]) {
    this.remover()?.remove(tracks);
    this.clear();
  }

  isLiked(track: Song) {
    return this.likes.has(track);
  }

  allLiked(tracks: Song[]) {
    return tracks.length > 0 && tracks.every((track) => this.likes.has(track));
  }

  /** Likes the tracks, or unlikes them when they all are liked */
  toggleLike(tracks: Song[]) {
    const unlike = this.allLiked(tracks);
    (unlike ? this.likes.unlike(tracks) : this.likes.like(tracks)).subscribe({
      error: () => this.notify(unlike ? 'The tracks could not be unliked' : 'The tracks could not be liked'),
    });
    if (tracks.length > 1) {
      this.notify(`${tracks.length} tracks ${unlike ? 'removed from' : 'added to'} your liked tracks`);
      this.clear();
    }
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
