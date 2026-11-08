import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Song } from '../../app-state';
import { MaterialModule } from '../../modules/material.module';
import { LyricsService, TrackLyrics } from '../../services/lyrics.service';
import { PlaybackService } from '../../services/playback.service';
import { formatTime } from '../format-time';
import { lrcStamp, parseLrc } from './lrc';

const SOURCES: Record<string, string> = {
  custom: 'Saved by an administrator.',
  file: 'Read from the .lrc file next to the track: saving keeps an edited copy, the file is not changed.',
  tags: 'Read from the tags of the file: saving keeps an edited copy, the file is not changed.',
};

/**
 * Lyrics of a track for the administrators: plain text or LRC. While the track plays,
 * "Stamp line" puts the current time in front of the line of the caret and goes to the next one.
 */
@Component({
  selector: 'app-lyrics-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Lyrics of “{{ track.title }}”</h2>
    <mat-dialog-content class="content">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      } @else {
        <p class="muted small">{{ sourceText() }}</p>
        <div class="toolbar">
          <button mat-stroked-button type="button" (click)="file.click()">
            <mat-icon>file_upload</mat-icon>
            Import a .lrc file
          </button>
          <input #file type="file" accept=".lrc,.txt,text/plain" hidden (change)="import(file)">
          <span class="spacer"></span>
          @if (playingThis()) {
            <span class="time" aria-live="off">{{ formatTime(playback.currentTime()) }}</span>
            <button mat-stroked-button type="button" (click)="playback.toggle()" [attr.aria-label]="playback.playing() ? 'Pause' : 'Play'">
              <mat-icon>{{ playback.playing() ? 'pause' : 'play_arrow' }}</mat-icon>
            </button>
            <button mat-flat-button type="button" (click)="stamp()" matTooltip="Alt+Enter in the text">
              <mat-icon>timer</mat-icon>
              Stamp line
            </button>
          } @else {
            <button mat-stroked-button type="button" (click)="playback.playNow(track)">
              <mat-icon>play_arrow</mat-icon>
              Play to sync
            </button>
          }
        </div>
        <textarea #editor class="editor" [ngModel]="text()" (ngModelChange)="text.set($event)" spellcheck="false"
          aria-label="Lyrics, plain or LRC" (keydown.alt.enter)="$event.preventDefault(); stamp()"
          placeholder="[00:12.50]First line&#10;[00:15.80]Second line&#10;&#10;or plain lyrics, without times"></textarea>
        <p class="muted small">
          @if (parsed().synced) {
            Synced: {{ parsed().lines.length }} timed {{ parsed().lines.length === 1 ? 'line' : 'lines' }}.
          } @else if (text().trim()) {
            Plain lyrics: they are shown without following the music. Stamp the lines to sync them.
          } @else {
            Paste the lyrics, then play the track and stamp each line when it starts.
          }
        </p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (source() === 'custom') {
        <button mat-button type="button" class="danger" (click)="remove()" [disabled]="saving()">Remove</button>
      }
      <span class="spacer"></span>
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button type="button" (click)="save()" [disabled]="saving() || loading()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .content {
      width: min(640px, 86vw);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .muted {
      margin: 0;
      color: var(--ongaku-muted);
    }
    .small {
      font-size: 13px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .spacer {
      flex: 1;
    }
    .time {
      min-width: 48px;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .editor {
      min-height: 320px;
      padding: 12px;
      resize: vertical;
      border-radius: var(--ongaku-radius-md);
      font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ongaku-text);
      background: var(--ongaku-surface-2);
      border: 1px solid var(--ongaku-border);
      &:focus {
        outline: 2px solid var(--ongaku-accent);
      }
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error, #d32f2f);
    }
    .danger {
      color: var(--mat-sys-error, #d32f2f);
    }
  `],
})
export class LyricsEditorDialogComponent {
  readonly track = inject<Song>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<LyricsEditorDialogComponent, TrackLyrics>>(MatDialogRef);
  private readonly lyrics = inject(LyricsService);
  readonly playback = inject(PlaybackService);

  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly source = signal<TrackLyrics['source']>(null);
  readonly text = signal('');
  readonly parsed = computed(() => parseLrc(this.text()));
  readonly playingThis = computed(() => this.playback.current()?.uid === this.track.uid);
  readonly sourceText = computed(() => {
    const source = this.source();
    return source ? SOURCES[source] : 'This track has no lyrics yet.';
  });

  readonly formatTime = formatTime;

  constructor() {
    this.lyrics.fetch(String(this.track.uid)).subscribe({
      next: (lyrics) => {
        this.source.set(lyrics.source);
        this.text.set(lyrics.lrc ?? '');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('The lyrics could not be loaded');
        this.loading.set(false);
      },
    });
  }

  import(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      file.text().then((text) => this.text.set(text.replace(/^﻿/, '')));
    }
  }

  /** Puts the current time in front of the line of the caret (replacing its stamps), then selects the next line */
  stamp() {
    const editor = this.editor()?.nativeElement;
    if (!editor || !this.playingThis()) {
      return;
    }
    const value = editor.value;
    const start = value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
    const endIndex = value.indexOf('\n', start);
    const end = endIndex < 0 ? value.length : endIndex;
    const line = value.slice(start, end).replace(/^(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/, '');
    const stamped = lrcStamp(this.playback.currentTime()) + line;
    const next = value.slice(0, start) + stamped + value.slice(end);
    this.text.set(next);
    editor.value = next;
    // The caret goes to the next line that has text
    let caret = start + stamped.length + 1;
    while (caret < next.length && next[caret] === '\n') {
      caret++;
    }
    editor.focus();
    editor.setSelectionRange(Math.min(caret, next.length), Math.min(caret, next.length));
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, next.slice(0, caret).split('\n').length - 4) * lineHeight;
  }

  save() {
    this.run(this.lyrics.save(String(this.track.uid), this.text()), 'The lyrics could not be saved');
  }

  remove() {
    this.run(this.lyrics.remove(String(this.track.uid)), 'The lyrics could not be removed');
  }

  private run(request: ReturnType<LyricsService['save']>, failure: string) {
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (lyrics) => this.dialogRef.close(lyrics),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(err.error?.message || failure);
      },
    });
  }
}
