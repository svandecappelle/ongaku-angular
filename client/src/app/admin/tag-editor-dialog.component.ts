import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MaterialModule } from '../modules/material.module';
import { AdminService, TrackTags } from '../services/admin.service';

export interface TagEditorData {
  uid: string;
  file: string;
  tags: Partial<TrackTags>;
}

/** Main tags of a track, written into its file. Closes with true once saved. */
@Component({
  selector: 'app-tag-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>Edit the tags</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="fields">
        <code class="file">{{ data.file }}</code>
        <mat-form-field>
          <mat-label>Artist</mat-label>
          <input matInput formControlName="artist" cdkFocusInitial>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Album</mat-label>
          <input matInput formControlName="album">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Title</mat-label>
          <input matInput formControlName="title">
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>Track number</mat-label>
            <input matInput formControlName="track" placeholder="3 or 3/12">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Year</mat-label>
            <input matInput formControlName="date">
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Genre</mat-label>
          <input matInput formControlName="genre">
        </mat-form-field>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .fields {
      min-width: min(440px, 80vw);
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }
    .file {
      margin-bottom: 8px;
      font-size: 12px;
      overflow-wrap: anywhere;
      color: var(--ongaku-muted);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error, #d32f2f);
    }
  `],
})
export class TagEditorDialogComponent {
  readonly data = inject<TagEditorData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TagEditorDialogComponent, boolean>>(MatDialogRef);
  private readonly admin = inject(AdminService);

  private readonly text = (value: unknown) => new FormControl(value === undefined || value === null ? '' : String(value), { nonNullable: true });
  readonly form = new FormGroup({
    artist: this.text(this.data.tags.artist),
    album: this.text(this.data.tags.album),
    title: this.text(this.data.tags.title),
    track: this.text(this.data.tags.track),
    date: this.text(this.data.tags.date),
    genre: this.text(this.data.tags.genre),
  });
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  save() {
    // Only the filled tags are written: an empty field leaves the tag as it is
    const values = this.form.getRawValue();
    const tags = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)) as Partial<TrackTags>;
    this.saving.set(true);
    this.error.set(null);
    this.admin.writeTags([this.data.uid], tags).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(err.error?.message || 'The tags could not be written');
      },
    });
  }
}
