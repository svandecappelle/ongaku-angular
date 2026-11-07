import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { MaterialModule } from '../modules/material.module';

/** Confirms the deletion of an account; closes with { deleteFiles } */
@Component({
  selector: 'app-delete-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  template: `
    <h2 mat-dialog-title>Delete “{{ data.username }}”?</h2>
    <mat-dialog-content class="content">
      <p>The account, its settings, its library and its playlists are deleted. This cannot be undone.</p>
      <mat-checkbox [checked]="deleteFiles()" (change)="deleteFiles.set($event.checked)">
        Also delete the files this user uploaded
      </mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close cdkFocusInitial>Cancel</button>
      <button mat-flat-button type="button" class="danger" [mat-dialog-close]="{ deleteFiles: deleteFiles() }">Delete</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .content p {
      margin-top: 0;
    }
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error, #d32f2f);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error, #fff);
    }
  `],
})
export class DeleteUserDialogComponent {
  readonly data = inject<{ username: string }>(MAT_DIALOG_DATA);
  readonly deleteFiles = signal(false);
}
