import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpEventType, HttpParams, HttpRequest } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../modules/material.module';

interface UploadedFile {
  name: string;
  type: 'directory' | 'file';
  size: number | null;
  modified: number;
  audio: boolean;
}

interface ImportResult {
  file: string;
  imported?: string[];
  error?: string;
}

/** Upload quota of the user, in bytes; quota and remaining are null when unlimited */
interface Quota {
  used: number;
  quota: number | null;
  remaining: number | null;
}

/** A file queued for upload */
interface UploadItem {
  file: File;
  progress: number;
  state: 'waiting' | 'uploading' | 'done' | 'error';
  result?: ImportResult;
}

/** Files the user uploaded (his private library): folders, upload of audio files and archives, deletion */
@Component({
  selector: 'app-uploads-browser',
  templateUrl: './uploads-browser.component.html',
  styleUrls: ['./uploads-browser.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, DatePipe],
})
export class UploadsBrowserComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);

  /** Folder shown, relative to the uploads folder ('' for the root) */
  readonly path = input('');
  readonly navigate = output<string>();
  /** Emitted once uploaded or deleted files changed the library */
  readonly changed = output<void>();

  readonly files = signal<UploadedFile[] | null>(null);
  readonly failed = signal(false);
  readonly newFolder = signal<string | null>(null);
  readonly items = signal<UploadItem[]>([]);
  readonly uploading = computed(() => this.items().some((item) => item.state === 'uploading'));
  readonly dragging = signal(false);
  readonly quota = signal<Quota | null>(null);
  /** Share of the quota used, in percent */
  readonly quotaPercent = computed(() => {
    const quota = this.quota();
    return quota?.quota ? Math.min(100, Math.round((100 * quota.used) / quota.quota)) : 0;
  });

  readonly crumbs = computed(() => {
    const parts = this.path().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
  });

  constructor() {
    effect(() => {
      this.path();
      untracked(() => this.load());
    });
  }

  load() {
    this.failed.set(false);
    this.http.get<Quota>('/api/user/quota').subscribe({ next: (quota) => this.quota.set(quota), error: () => this.quota.set(null) });
    this.http.get<{ files: UploadedFile[] }>('/api/user/files', { params: { path: this.path() } }).subscribe({
      next: (answer) => this.files.set(answer.files),
      error: () => {
        this.files.set(null);
        this.failed.set(true);
      },
    });
  }

  open(file: UploadedFile) {
    if (file.type === 'directory') {
      this.navigate.emit(this.join(file.name));
    }
  }

  createFolder() {
    const name = (this.newFolder() ?? '').trim();
    if (!name) {
      this.newFolder.set(null);
      return;
    }
    this.http.post('/api/user/files/folder', { name }, { params: { path: this.path() } }).subscribe({
      next: () => {
        this.newFolder.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => this.error(err, 'The folder could not be created'),
    });
  }

  remove(file: UploadedFile) {
    const what = file.type === 'directory' ? `the folder “${file.name}” and everything in it` : `“${file.name}”`;
    if (!confirm(`Delete ${what}? This cannot be undone.`)) {
      return;
    }
    this.http.delete('/api/user/files', { params: { path: this.join(file.name) } }).subscribe({
      next: () => {
        this.snackBar.open(`“${file.name}” deleted`, undefined, { duration: 3000 });
        this.load();
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => this.error(err, 'The file could not be deleted'),
    });
  }

  addFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const added = Array.from(files).map((file): UploadItem => ({ file, progress: 0, state: 'waiting' }));
    this.items.update((items) => [...items.filter((item) => item.state !== 'done'), ...added]);
    if (!this.uploading()) {
      this.next();
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    this.addFiles(event.dataTransfer?.files ?? null);
  }

  clearFinished() {
    this.items.update((items) => items.filter((item) => item.state === 'waiting' || item.state === 'uploading'));
  }

  /** Files are sent one after the other, to the folder shown when they were added */
  private next() {
    const item = this.items().find((i) => i.state === 'waiting');
    if (!item) {
      this.load();
      this.changed.emit();
      return;
    }
    // Known too large for the quota: not sent (the server checks anyway)
    const remaining = this.quota()?.remaining;
    if (remaining !== null && remaining !== undefined && item.file.size > remaining) {
      this.patch(item, { state: 'error', result: { file: item.file.name, error: `Larger than your remaining quota (${this.formatSize(remaining)} left)` } });
      this.next();
      return;
    }
    const formData = new FormData();
    formData.append('file', item.file, item.file.name);
    const request = new HttpRequest('POST', '/api/user/files/upload', formData, {
      params: new HttpParams({ fromObject: { path: this.path() } }),
      reportProgress: true,
    });
    this.patch(item, { state: 'uploading' });
    this.http.request<{ files: ImportResult[] }>(request).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.patch(item, { progress: Math.round(100 * event.loaded / event.total) });
        } else if (event.type === HttpEventType.Response) {
          const result = event.body?.files?.[0] ?? { file: item.file.name, imported: [] };
          // An archive may be partly imported (quota reached)
          this.patch(item, { state: result.error && !result.imported?.length ? 'error' : 'done', progress: 100, result });
          this.refreshQuota();
          this.next();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.patch(item, { state: 'error', result: { file: item.file.name, error: err.error?.message || 'Upload failed' } });
        this.next();
      },
    });
  }

  private refreshQuota() {
    this.http.get<Quota>('/api/user/quota').subscribe({ next: (quota) => this.quota.set(quota) });
  }

  icon(file: UploadedFile) {
    if (file.type === 'directory') {
      return 'folder';
    }
    if (file.audio) {
      return 'audiotrack';
    }
    return /\.(jpe?g|png|gif|webp)$/i.test(file.name) ? 'photo' : 'insert_drive_file';
  }

  readonly formatSize = (bytes: number | null) => {
    if (bytes === null) {
      return '';
    }
    if (!bytes) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, exponent)).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
  };

  private join(name: string) {
    return this.path() ? `${this.path()}/${name}` : name;
  }

  private patch(item: UploadItem, changes: Partial<UploadItem>) {
    Object.assign(item, changes);
    this.items.update((items) => [...items]);
  }

  private error(err: HttpErrorResponse, fallback: string) {
    this.snackBar.open(err.error?.message || fallback, undefined, { duration: 5000 });
  }
}
