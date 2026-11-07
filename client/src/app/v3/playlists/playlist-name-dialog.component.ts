import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MaterialModule } from '../../modules/material.module';

export interface PlaylistNameDialogData {
  /** Current name when renaming */
  name?: string;
  /** Tracks the new playlist will hold, shown in the title */
  count?: number;
}

/** Name of a new playlist, or new name of an existing one. Closes with the trimmed name. */
@Component({
  selector: 'app-playlist-name-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ renaming ? 'Rename the playlist' : 'New playlist' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="fields">
        @if (!renaming && data.count) {
          <p class="muted">With {{ data.count }} {{ data.count > 1 ? 'tracks' : 'track' }}.</p>
        }
        <mat-form-field>
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" maxlength="100" autocomplete="off" cdkFocusInitial>
          <mat-hint align="end">{{ name.value.length }}/100</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="!name.value.trim()">{{ renaming ? 'Rename' : 'Create' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .fields {
      min-width: min(380px, 80vw);
      padding-top: 8px;
    }
    .muted {
      margin: 0 0 12px;
      color: var(--ongaku-muted);
    }
    mat-form-field {
      width: 100%;
    }
  `],
})
export class PlaylistNameDialogComponent {
  readonly data = inject<PlaylistNameDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly dialogRef = inject<MatDialogRef<PlaylistNameDialogComponent, string>>(MatDialogRef);

  readonly renaming = this.data.name !== undefined;
  readonly name = new FormControl(this.data.name ?? '', { nonNullable: true, validators: [Validators.required] });
  readonly form = new FormGroup({ name: this.name });

  submit() {
    const name = this.name.value.trim();
    if (name) {
      this.dialogRef.close(name);
    }
  }
}
