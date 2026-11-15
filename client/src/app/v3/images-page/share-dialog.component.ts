import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { MaterialModule } from '../../modules/material.module';
import { GalleryImage, GalleryService, ImageShare, ShareExpiry } from '../../services/gallery.service';

/** Data of the dialog: the images to share, and a title to suggest */
export interface ShareDialogData {
  images: GalleryImage[];
  title: string;
}

/**
 * Makes a public link to images: a title and how long it works, then the link to copy. Whoever
 * has the link sees the images, without an account.
 */
@Component({
  selector: 'app-share-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, DatePipe],
  template: `
    <h2 mat-dialog-title>{{ created() ? 'Link ready' : 'Share ' + data.images.length + (data.images.length === 1 ? ' image' : ' images') }}</h2>
    <mat-dialog-content class="content">
      @if (created(); as link) {
        <p class="muted">Anyone with this link can see {{ link.count === 1 ? 'this image' : 'these ' + link.count + ' images' }}, without an account{{ link.expires ? ', until ' + (link.expires | date: 'mediumDate') : '' }}. Revoke it from “Shared links” at any time.</p>
        <div class="link-row">
          <input class="link" readonly [value]="url()" (focus)="$any($event.target).select()" aria-label="Link">
          <button mat-flat-button color="accent" type="button" class="copy" (click)="copy()">
            <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
            {{ copied() ? 'Copied' : 'Copy' }}
          </button>
        </div>
      } @else {
        <p class="muted">Anyone with the link will see these images, without an account. Nothing else of yours is shown.</p>
        <mat-form-field>
          <mat-label>Title</mat-label>
          <input matInput [(ngModel)]="title" maxlength="100" cdkFocusInitial autocomplete="off">
        </mat-form-field>
        <mat-form-field>
          <mat-label>The link works</mat-label>
          <mat-select [(ngModel)]="expiry">
            @for (option of expiries; track option.days) {
              <mat-option [value]="option.days">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (created(); as link) {
        <a mat-button [href]="url()" target="_blank" rel="noopener">
          <mat-icon>open_in_new</mat-icon>
          Open
        </a>
        <button mat-flat-button type="button" [mat-dialog-close]="true">Done</button>
      } @else {
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button color="accent" type="button" class="create" (click)="create()" [disabled]="busy()">
          <mat-icon>link</mat-icon>
          {{ busy() ? 'Creating…' : 'Create the link' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(440px, 80vw);
    }
    p {
      margin: 0 0 12px;
    }
    .error {
      color: var(--mat-sys-error, #ff8a80);
    }
    .link-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .link {
      flex: 1;
      min-width: 0;
      padding: 10px 12px;
      border-radius: 8px;
      font: inherit;
      font-size: 14px;
      color: var(--ongaku-text);
      background: var(--ongaku-surface-2);
      border: 1px solid var(--ongaku-border);
    }
  `],
})
export class ShareDialogComponent {
  readonly data = inject<ShareDialogData>(MAT_DIALOG_DATA);
  private readonly gallery = inject(GalleryService);

  readonly expiries: { days: ShareExpiry; label: string }[] = [
    { days: 0, label: 'Until I revoke it' },
    { days: 1, label: 'For 1 day' },
    { days: 7, label: 'For 7 days' },
    { days: 30, label: 'For 30 days' },
  ];
  title = this.data.title;
  expiry: ShareExpiry = 0;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly created = signal<ImageShare | null>(null);
  readonly url = signal('');
  readonly copied = signal(false);

  create() {
    this.busy.set(true);
    this.error.set(null);
    this.gallery.share(this.data.images, this.title.trim(), this.expiry).subscribe({
      next: (share) => {
        this.busy.set(false);
        this.url.set(this.gallery.shareUrl(share.token));
        this.created.set(share);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(err.error?.message || 'The link could not be created');
      },
    });
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.error.set('Could not access the clipboard: copy the link by hand');
    }
  }
}
