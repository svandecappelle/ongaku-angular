import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../../modules/material.module';
import { GalleryService, ImageShare } from '../../services/gallery.service';

/** The public links of the member to his images: copy, open, revoke */
@Component({
  selector: 'app-shares-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, DatePipe],
  template: `
    <h2 mat-dialog-title>Shared links</h2>
    <mat-dialog-content class="content">
      @if (shares(); as list) {
        @if (list.length) {
          <ul class="shares">
            @for (share of list; track share.token) {
              <li class="share" [class.expired]="share.expired">
                <div class="share-text">
                  <strong>{{ share.title }}</strong>
                  <span class="muted small">
                    {{ share.count }} {{ share.count === 1 ? 'image' : 'images' }} · {{ share.views }} {{ share.views === 1 ? 'view' : 'views' }}
                    · {{ share.created | date: 'mediumDate' }}
                    @if (share.expired) {
                      · <span class="tag">Expired</span>
                    } @else if (share.expires) {
                      · until {{ share.expires | date: 'mediumDate' }}
                    }
                  </span>
                </div>
                @if (!share.expired) {
                  <button mat-icon-button type="button" class="copy" (click)="copy(share)" [attr.aria-label]="'Copy the link ' + share.title" matTooltip="Copy the link">
                    <mat-icon>content_copy</mat-icon>
                  </button>
                  <a mat-icon-button [href]="gallery.shareUrl(share.token)" target="_blank" rel="noopener" [attr.aria-label]="'Open ' + share.title" matTooltip="Open">
                    <mat-icon>open_in_new</mat-icon>
                  </a>
                }
                <button mat-icon-button type="button" class="revoke" (click)="revoke(share)" [attr.aria-label]="'Revoke ' + share.title" matTooltip="Revoke">
                  <mat-icon>block</mat-icon>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="muted empty">No link yet. Select images, then “Share”, to make one.</p>
        }
      } @else if (failed()) {
        <p class="muted empty">The links could not be loaded.</p>
      } @else {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .content {
      min-width: min(520px, 82vw);
    }
    .shares {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
    }
    .share {
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid var(--ongaku-border);
      &.expired strong {
        color: var(--ongaku-muted);
      }
    }
    .share-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
    .small {
      font-size: 13px;
    }
    .tag {
      color: var(--mat-sys-error, #ff8a80);
    }
    .empty {
      margin: 8px 0;
    }
  `],
})
export class SharesDialogComponent {
  readonly gallery = inject(GalleryService);
  private readonly snackBar = inject(MatSnackBar);

  readonly shares = signal<ImageShare[] | null>(null);
  readonly failed = signal(false);

  constructor() {
    this.gallery.shares().subscribe({
      next: (shares) => this.shares.set(shares),
      error: () => this.failed.set(true),
    });
  }

  async copy(share: ImageShare) {
    try {
      await navigator.clipboard.writeText(this.gallery.shareUrl(share.token));
      this.snackBar.open('Link copied', undefined, { duration: 2000 });
    } catch {
      this.snackBar.open('Could not access the clipboard', undefined, { duration: 3000 });
    }
  }

  revoke(share: ImageShare) {
    if (!confirm(`Revoke the link “${share.title}”? Whoever has it will no longer see the images.`)) {
      return;
    }
    this.gallery.revoke(share.token).subscribe({
      next: () => {
        this.shares.update((shares) => (shares ?? []).filter((other) => other.token !== share.token));
        this.snackBar.open('Link revoked', undefined, { duration: 3000 });
      },
      error: () => this.snackBar.open('The link could not be revoked', undefined, { duration: 4000 }),
    });
  }
}
