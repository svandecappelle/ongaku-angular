import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { MaterialModule } from '../modules/material.module';

interface ResetLink {
  token: string;
  username: string;
  created: number;
  expires: number;
  createdBy: string;
}

type Duration = 1 | 24 | 168;

/**
 * A password reset link for an account: the person opens it and chooses a new password, once.
 * A new link replaces the one waiting; the sessions of the account end when it is used.
 */
@Component({
  selector: 'app-reset-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, DatePipe],
  template: `
    <h2 mat-dialog-title>Password reset link for “{{ data.username }}”</h2>
    <mat-dialog-content class="content">
      <p class="muted">Give this link to {{ data.username }}: it opens a page to choose a new password, once. The sessions opened with the old password end. No e-mail is sent.</p>

      @if (link(); as current) {
        <div class="link-row">
          <input class="link" readonly [value]="url(current)" (focus)="$any($event.target).select()" aria-label="Reset link">
          <button mat-flat-button color="accent" type="button" class="copy" (click)="copy(current)">
            <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
            {{ copied() ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p class="muted small">Works until {{ current.expires | date: 'medium' }} · made by {{ current.createdBy }}</p>
      } @else if (loaded()) {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>The link works for</mat-label>
          <mat-select [(ngModel)]="duration">
            <mat-option [value]="1">1 hour</mat-option>
            <mat-option [value]="24">24 hours</mat-option>
            <mat-option [value]="168">7 days</mat-option>
          </mat-select>
        </mat-form-field>
      } @else {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions class="actions">
      @if (link()) {
        <button mat-button type="button" class="revoke" (click)="revoke()">
          <mat-icon>block</mat-icon>
          Revoke
        </button>
        <button mat-button type="button" class="replace" (click)="link.set(null)">New link</button>
      }
      <span class="spacer"></span>
      <button mat-button type="button" mat-dialog-close>Close</button>
      @if (!link() && loaded()) {
        <button mat-flat-button color="accent" type="button" class="create" (click)="create()" [disabled]="busy()">
          <mat-icon>link</mat-icon>
          {{ busy() ? 'Creating…' : 'Create the link' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .content {
      min-width: min(480px, 82vw);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    p {
      margin: 0 0 8px;
    }
    .small {
      font-size: 13px;
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
    .error {
      color: var(--mat-sys-error, #ff8a80);
    }
    .actions {
      display: flex;
    }
    .spacer {
      flex: 1;
    }
  `],
})
export class ResetLinkDialogComponent {
  readonly data = inject<{ username: string }>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly base = `/api/admin/users/${encodeURIComponent(this.data.username)}/reset-link`;

  duration: Duration = 24;
  readonly link = signal<ResetLink | null>(null);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // The link waiting for this account, if any
    this.http.get<{ reset: ResetLink | null }>(this.base).subscribe({
      next: ({ reset }) => {
        this.link.set(reset);
        this.loaded.set(true);
      },
      error: () => {
        this.loaded.set(true);
        this.error.set('The link of this account could not be read');
      },
    });
  }

  url(link: ResetLink): string {
    return `${location.origin}/reset/${link.token}`;
  }

  create() {
    this.busy.set(true);
    this.error.set(null);
    this.http.post<ResetLink>(this.base, { expiresInHours: this.duration }).subscribe({
      next: (link) => {
        this.busy.set(false);
        this.link.set(link);
        this.copy(link);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(err.error?.message || 'The link could not be created');
      },
    });
  }

  async copy(link: ResetLink) {
    try {
      await navigator.clipboard.writeText(this.url(link));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // No clipboard: the link stays shown to be copied by hand
    }
  }

  revoke() {
    this.http.delete(this.base).subscribe({
      next: () => this.link.set(null),
      error: () => this.error.set('The link could not be revoked'),
    });
  }
}
