import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MaterialModule } from '../modules/material.module';

/** What is moved: from which folder, and the paths of the items (folders among them) */
export interface MoveDialogData {
  from: string;
  paths: string[];
  /** The paths of the folders moved: neither they nor their sub folders can be chosen */
  folders: string[];
}

interface FolderRow {
  path: string;
  name: string;
  depth: number;
  disabled: boolean;
}

/**
 * Chooses the folder of the uploads to move items into: the tree of the folders, the folder
 * they are in and the moved folders left out; a new folder can be made in the one chosen.
 * Closes with the path of the folder ('' for the root of the uploads).
 */
@Component({
  selector: 'app-move-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Move {{ data.paths.length === 1 ? '“' + name(data.paths[0]) + '”' : data.paths.length + ' items' }}</h2>
    <mat-dialog-content class="content">
      @if (rows(); as list) {
        <ul class="tree" role="listbox" aria-label="Folders">
          @for (row of list; track row.path) {
            <li>
              <button type="button" class="row" role="option" [style.padding-left.px]="12 + row.depth * 20"
                [class.chosen]="chosen() === row.path" [attr.aria-selected]="chosen() === row.path" [disabled]="row.disabled"
                (click)="chosen.set(row.path)" (dblclick)="!row.disabled && confirm(row.path)">
                <mat-icon aria-hidden="true">{{ row.path === '' ? 'home' : chosen() === row.path ? 'folder_open' : 'folder' }}</mat-icon>
                <span class="row-name">{{ row.name }}</span>
                @if (row.path === data.from) {
                  <span class="muted small">here now</span>
                }
              </button>
            </li>
          }
        </ul>
        @if (newName() !== null) {
          <form class="new-folder" (ngSubmit)="createFolder()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>New folder in {{ chosen() === '' ? 'Uploads' : name(chosen()!) }}</mat-label>
              <input matInput name="folder" [ngModel]="newName()" (ngModelChange)="newName.set($event)" autocomplete="off" cdkFocusInitial
                (keydown.escape)="$event.stopPropagation(); newName.set(null)">
            </mat-form-field>
            <button mat-flat-button type="submit">Create</button>
          </form>
        }
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      } @else {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
    </mat-dialog-content>
    <mat-dialog-actions class="actions">
      <button mat-button type="button" class="new" (click)="newName.set('')" [disabled]="newName() !== null || chosen() === null">
        <mat-icon>create_new_folder</mat-icon>
        New folder
      </button>
      <span class="spacer"></span>
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button color="accent" type="button" class="confirm" (click)="confirm(chosen()!)" [disabled]="!canMove()">
        Move here
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .content {
      min-width: min(460px, 82vw);
    }
    .tree {
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: 50vh;
      overflow: auto;
      border: 1px solid var(--ongaku-border);
      border-radius: 10px;
    }
    .row {
      width: 100%;
      padding: 8px 12px;
      border: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      font: inherit;
      text-align: left;
      color: var(--ongaku-text);
      background: transparent;
      cursor: pointer;
      &:hover:not(:disabled) {
        background: var(--ongaku-surface-2);
      }
      &:disabled {
        opacity: .45;
        cursor: default;
      }
      &.chosen {
        background: color-mix(in srgb, var(--ongaku-accent) 18%, transparent);
        mat-icon {
          color: var(--ongaku-accent);
        }
      }
      mat-icon {
        color: var(--ongaku-muted);
      }
    }
    .row-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .small {
      font-size: 12px;
    }
    .new-folder {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      mat-form-field {
        flex: 1;
      }
    }
    .error {
      margin: 8px 0 0;
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
export class MoveDialogComponent {
  readonly data = inject<MoveDialogData>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly ref = inject(MatDialogRef<MoveDialogComponent, string>);

  private readonly folders = signal<string[] | null>(null);
  readonly chosen = signal<string | null>(null);
  readonly newName = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly rows = computed<FolderRow[] | null>(() => {
    const folders = this.folders();
    if (!folders) {
      return null;
    }
    const blocked = (folder: string) => folder === this.data.from
      || this.data.folders.some((moved) => folder === moved || folder.startsWith(moved + '/'));
    return folders.map((folder) => ({
      path: folder,
      name: folder === '' ? 'Uploads' : this.name(folder),
      depth: folder === '' ? 0 : folder.split('/').length,
      disabled: blocked(folder),
    }));
  });
  readonly canMove = computed(() => {
    const chosen = this.chosen();
    return chosen !== null && !this.rows()?.find((row) => row.path === chosen)?.disabled;
  });

  readonly name = (folder: string) => folder.split('/').pop() ?? folder;

  constructor() {
    this.load();
  }

  private load(select?: string) {
    this.http.get<{ folders: string[] }>('/api/user/files/folders').subscribe({
      next: ({ folders }) => {
        this.folders.set(folders);
        if (select !== undefined) {
          this.chosen.set(select);
        }
      },
      error: () => this.error.set('The folders could not be loaded'),
    });
  }

  createFolder() {
    const name = (this.newName() ?? '').trim();
    const parent = this.chosen() ?? '';
    if (!name) {
      this.newName.set(null);
      return;
    }
    this.http.post('/api/user/files/folder', { name }, { params: { path: parent } }).subscribe({
      next: () => {
        this.newName.set(null);
        this.error.set(null);
        this.load(parent ? `${parent}/${name}` : name);
      },
      error: (err: HttpErrorResponse) => this.error.set(err.error?.message || 'The folder could not be created'),
    });
  }

  confirm(folder: string) {
    if (this.chosen() !== folder) {
      this.chosen.set(folder);
    }
    if (this.canMove()) {
      this.ref.close(folder);
    }
  }
}
