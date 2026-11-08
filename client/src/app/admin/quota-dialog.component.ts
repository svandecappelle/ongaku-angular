import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MaterialModule } from '../modules/material.module';

export interface QuotaDialogData {
  username: string;
  /** MB; null: the default quota, 0: unlimited */
  uploadQuota: number | null;
  /** Default quota in MB, 0: unlimited */
  defaultQuota: number;
}

type Mode = 'default' | 'unlimited' | 'custom';

/** Upload quota of a user. Closes with { uploadQuota }: null (default), 0 (unlimited) or MB. */
@Component({
  selector: 'app-quota-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Upload quota of {{ data.username }}</h2>
    <form (submit)="$event.preventDefault(); submit()">
      <mat-dialog-content class="fields">
        <mat-radio-group [ngModel]="mode()" (ngModelChange)="mode.set($event)" name="mode" class="modes" aria-label="Quota">
          <mat-radio-button value="default">Default ({{ data.defaultQuota ? data.defaultQuota + ' MB' : 'unlimited' }})</mat-radio-button>
          <mat-radio-button value="unlimited">Unlimited</mat-radio-button>
          <mat-radio-button value="custom">Custom</mat-radio-button>
        </mat-radio-group>
        @if (mode() === 'custom') {
          <mat-form-field>
            <mat-label>Quota</mat-label>
            <input matInput type="number" min="1" step="1" name="mb" [ngModel]="mb()" (ngModelChange)="mb.set($event)" cdkFocusInitial>
            <span matTextSuffix>MB</span>
            <mat-hint>1024 MB = 1 GB</mat-hint>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="mode() === 'custom' && !(mb() > 0)">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .fields {
      min-width: min(360px, 80vw);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px;
    }
    .modes {
      display: flex;
      flex-direction: column;
    }
  `],
})
export class QuotaDialogComponent {
  readonly data = inject<QuotaDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<QuotaDialogComponent, { uploadQuota: number | null }>>(MatDialogRef);

  readonly mode = signal<Mode>(this.data.uploadQuota === null ? 'default' : this.data.uploadQuota === 0 ? 'unlimited' : 'custom');
  readonly mb = signal<number>(this.data.uploadQuota || this.data.defaultQuota || 1024);

  submit() {
    const mode = this.mode();
    if (mode === 'custom' && !(this.mb() > 0)) {
      return;
    }
    this.dialogRef.close({ uploadQuota: mode === 'default' ? null : mode === 'unlimited' ? 0 : Number(this.mb()) });
  }
}
