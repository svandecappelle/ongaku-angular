import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../modules/material.module';

/** A join link (server/app/middleware/invites.js) */
interface JoinLink {
  token: string;
  createdBy: string;
  note: string;
  created: number;
  expires: number | null;
  usedBy: string | null;
  usedAt: number | null;
  state: 'open' | 'used' | 'expired';
}

type Expiry = 0 | 1 | 7 | 30;

/**
 * Join links of the Users tab: each one lets a person create an account, once, even when sign
 * up is closed. Made with a note (who it is for) and how long it works; copied, revoked.
 */
@Component({
  selector: 'app-join-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, DatePipe],
  template: `
    <section class="panel" aria-labelledby="join-links-title">
      <div class="panel-header">
        <h2 id="join-links-title">Join links</h2>
        <span class="muted">A link lets one person create an account, even when sign up is closed. It works once.</span>
      </div>

      <form class="create" (ngSubmit)="create()">
        <mat-form-field subscriptSizing="dynamic" class="note">
          <mat-label>For whom (a note for you)</mat-label>
          <input matInput name="note" [(ngModel)]="note" maxlength="100" autocomplete="off">
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic" class="expiry">
          <mat-label>Works</mat-label>
          <mat-select name="expiry" [(ngModel)]="expiry">
            @for (option of expiries; track option.days) {
              <mat-option [value]="option.days">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button color="accent" type="submit" class="create-link" [disabled]="creating()">
          <mat-icon>link</mat-icon>
          {{ creating() ? 'Creating…' : 'Create a link' }}
        </button>
      </form>

      @if (fresh(); as link) {
        <div class="fresh" role="status">
          <mat-icon aria-hidden="true">check_circle</mat-icon>
          <input class="link" readonly [value]="url(link)" (focus)="$any($event.target).select()" aria-label="The new join link">
          <button mat-stroked-button type="button" class="copy-fresh" (click)="copy(link)">
            <mat-icon>content_copy</mat-icon>
            Copy
          </button>
        </div>
      }

      @if (links(); as list) {
        @if (list.length) {
          <ul class="links">
            @for (link of list; track link.token) {
              <li class="link-row" [attr.data-state]="link.state">
                <span class="state-chip">{{ stateLabel(link) }}</span>
                <div class="link-text">
                  <strong>{{ link.note || 'Join link' }}</strong>
                  <span class="muted small">
                    @switch (link.state) {
                      @case ('used') { Account “{{ link.usedBy }}” created {{ link.usedAt | date: 'medium' }} }
                      @case ('expired') { Expired {{ link.expires | date: 'mediumDate' }} }
                      @default { {{ link.expires ? 'Until ' + (link.expires | date: 'mediumDate') : 'Until used' }} }
                    }
                    · by {{ link.createdBy }} {{ link.created | date: 'mediumDate' }}
                  </span>
                </div>
                @if (link.state === 'open') {
                  <button mat-icon-button type="button" class="copy" (click)="copy(link)" [attr.aria-label]="'Copy the link ' + (link.note || '')" matTooltip="Copy the link">
                    <mat-icon>content_copy</mat-icon>
                  </button>
                }
                <button mat-icon-button type="button" class="revoke" (click)="revoke(link)"
                  [attr.aria-label]="(link.state === 'open' ? 'Revoke ' : 'Remove ') + (link.note || 'the link')"
                  [matTooltip]="link.state === 'open' ? 'Revoke' : 'Remove from the list'">
                  <mat-icon>{{ link.state === 'open' ? 'block' : 'close' }}</mat-icon>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="muted empty">No join link yet.</p>
        }
      } @else {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }
    .panel {
      padding: 24px;
      border-radius: var(--ongaku-radius-xl);
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: var(--ongaku-surface);
      border: 1px solid var(--ongaku-border);
    }
    .panel-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
      h2 {
        margin: 0;
        font-size: 20px;
      }
    }
    .muted {
      color: var(--ongaku-muted);
    }
    .small {
      font-size: 13px;
    }
    .create {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      .note {
        flex: 1 1 240px;
      }
      .expiry {
        flex: 0 1 180px;
      }
    }
    .fresh {
      padding: 10px 12px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: color-mix(in srgb, var(--ongaku-accent) 12%, transparent);
      mat-icon {
        color: var(--ongaku-accent);
      }
    }
    .link {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      border-radius: 8px;
      font: inherit;
      font-size: 14px;
      color: var(--ongaku-text);
      background: var(--ongaku-surface-2);
      border: 1px solid var(--ongaku-border);
    }
    .links {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .link-row {
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--ongaku-border);
    }
    .link-text {
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
    .state-chip {
      flex: none;
      min-width: 64px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      color: var(--ongaku-accent);
      border: 1px solid color-mix(in srgb, var(--ongaku-accent) 50%, transparent);
    }
    .link-row[data-state='used'] .state-chip,
    .link-row[data-state='expired'] .state-chip {
      color: var(--ongaku-muted);
      border-color: var(--ongaku-border);
    }
    .empty {
      margin: 0;
    }
  `],
})
export class JoinLinksComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);

  readonly expiries: { days: Expiry; label: string }[] = [
    { days: 1, label: '1 day' },
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 0, label: 'Until used' },
  ];
  note = '';
  expiry: Expiry = 7;
  readonly links = signal<JoinLink[] | null>(null);
  readonly creating = signal(false);
  /** The link just made, shown with its address to copy */
  readonly fresh = signal<JoinLink | null>(null);
  readonly openCount = computed(() => (this.links() ?? []).filter((link) => link.state === 'open').length);

  constructor() {
    this.load();
  }

  load() {
    this.http.get<{ invites: JoinLink[] }>('/api/admin/invites').subscribe({
      next: ({ invites }) => this.links.set(invites),
      error: () => this.links.set([]),
    });
  }

  url(link: JoinLink): string {
    return `${location.origin}/join/${link.token}`;
  }

  stateLabel(link: JoinLink): string {
    return { open: 'Waiting', used: 'Used', expired: 'Expired' }[link.state];
  }

  create() {
    this.creating.set(true);
    this.http.post<JoinLink>('/api/admin/invites', { note: this.note.trim(), expiresInDays: this.expiry }).subscribe({
      next: (link) => {
        this.creating.set(false);
        this.note = '';
        this.fresh.set(link);
        this.links.update((links) => [link, ...(links ?? [])]);
        this.copy(link);
      },
      error: (err: HttpErrorResponse) => {
        this.creating.set(false);
        this.snackBar.open(err.error?.message || 'The link could not be created', undefined, { duration: 5000 });
      },
    });
  }

  async copy(link: JoinLink) {
    try {
      await navigator.clipboard.writeText(this.url(link));
      this.snackBar.open('Join link copied', undefined, { duration: 2500 });
    } catch {
      // No clipboard (http, permissions): the address stays shown to be copied by hand
    }
  }

  revoke(link: JoinLink) {
    if (link.state === 'open' && !confirm(`Revoke the join link${link.note ? ` “${link.note}”` : ''}? It will no longer create an account.`)) {
      return;
    }
    this.http.delete(`/api/admin/invites/${encodeURIComponent(link.token)}`).subscribe({
      next: () => {
        this.links.update((links) => (links ?? []).filter((other) => other.token !== link.token));
        if (this.fresh()?.token === link.token) {
          this.fresh.set(null);
        }
      },
      error: () => this.snackBar.open('The link could not be revoked', undefined, { duration: 4000 }),
    });
  }
}
