import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpEventType, HttpParams, HttpRequest } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageEvent } from '@angular/material/paginator';

import { MaterialModule } from '../modules/material.module';

interface UploadedFile {
  name: string;
  type: 'directory' | 'file';
  size: number | null;
  modified: number;
  audio: boolean;
  video?: boolean;
}

interface ImportResult {
  file: string;
  imported?: string[];
  error?: string;
}

/** A page of a folder (GET /api/user/files) */
interface FilesPage {
  files: UploadedFile[];
  total: number;
  page: number;
  size: number;
}

/** The paginator and the filter show from this many items */
const MIN_PAGED = 25;
const PAGE_SIZE_KEY = 'ongaku.uploads.pageSize';

function savedPageSize(): number {
  try {
    const size = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return [25, 50, 100, 200].includes(size) ? size : 50;
  } catch {
    return 50;
  }
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
  /** A page is loading: the previous one stays shown meanwhile */
  readonly loading = signal(false);
  readonly page = signal(0);
  readonly pageSize = signal(savedPageSize());
  /** Items of the folder (matching the filter) */
  readonly total = signal(0);
  readonly filter = signal('');
  readonly pageSizes = [25, 50, 100, 200];
  readonly paged = computed(() => this.total() > MIN_PAGED || this.page() > 0 || !!this.filter());
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  /** Answers of an older request are dropped */
  private request = 0;
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

  /** Names checked in the page shown: cleared with another folder, page or filter */
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly deleting = signal(false);
  /** Last row checked, for the range of a shift click */
  private anchor: string | null = null;
  readonly selectedFiles = computed(() => (this.files() ?? []).filter((file) => this.selected().has(file.name)));
  readonly allSelected = computed(() => !!this.files()?.length && this.selectedFiles().length === this.files()!.length);
  readonly someSelected = computed(() => this.selectedFiles().length > 0 && !this.allSelected());
  readonly selectionSize = computed(() => this.selectedFiles().reduce((sum, file) => sum + (file.size ?? 0), 0));
  /** "2 files and 1 folder" */
  readonly selectionLabel = computed(() => {
    const files = this.selectedFiles().filter((file) => file.type === 'file').length;
    const folders = this.selectedFiles().length - files;
    const parts = [
      files ? `${files} ${files === 1 ? 'file' : 'files'}` : '',
      folders ? `${folders} ${folders === 1 ? 'folder' : 'folders'}` : '',
    ].filter(Boolean);
    return parts.join(' and ');
  });

  readonly crumbs = computed(() => {
    const parts = this.path().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
  });

  constructor() {
    // Another folder: its first page, without filter
    effect(() => {
      this.path();
      untracked(() => {
        this.page.set(0);
        this.filter.set('');
        this.files.set(null);
        this.load();
      });
    });
  }

  load() {
    this.clearSelection();
    this.failed.set(false);
    this.loading.set(true);
    const request = ++this.request;
    this.http.get<Quota>('/api/user/quota').subscribe({ next: (quota) => this.quota.set(quota), error: () => this.quota.set(null) });
    const params = { path: this.path(), page: this.page(), size: this.pageSize(), q: this.filter().trim() };
    this.http.get<FilesPage>('/api/user/files', { params }).subscribe({
      next: (answer) => {
        if (request !== this.request) {
          return;
        }
        this.loading.set(false);
        this.files.set(answer.files);
        this.total.set(answer.total ?? answer.files.length);
        // The server goes back to the last page when files were deleted
        this.page.set(answer.page ?? 0);
      },
      error: () => {
        if (request !== this.request) {
          return;
        }
        this.loading.set(false);
        this.files.set(null);
        this.failed.set(true);
      },
    });
  }

  onPage(event: PageEvent) {
    if (event.pageSize !== this.pageSize()) {
      this.pageSize.set(event.pageSize);
      try {
        localStorage.setItem(PAGE_SIZE_KEY, String(event.pageSize));
      } catch {
        // Storage unavailable: the size lasts for this visit
      }
    }
    this.page.set(event.pageIndex);
    this.load();
  }

  /** Filters by name, once the typing pauses */
  setFilter(value: string) {
    this.filter.set(value);
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      this.page.set(0);
      this.load();
    }, 250);
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

  isSelected(file: UploadedFile) {
    return this.selected().has(file.name);
  }

  /** Shift held when a box was pressed (its change event does not tell, and comes before the click) */
  shift = false;

  /** Checks or unchecks a row; with shift, the rows since the last one checked too */
  toggle(file: UploadedFile, range = false) {
    const files = this.files() ?? [];
    const check = !this.isSelected(file);
    const next = new Set(this.selected());
    const from = this.anchor === null ? -1 : files.findIndex((f) => f.name === this.anchor);
    const to = files.findIndex((f) => f.name === file.name);
    if (range && from >= 0 && to >= 0) {
      for (const f of files.slice(Math.min(from, to), Math.max(from, to) + 1)) {
        if (check) {
          next.add(f.name);
        } else {
          next.delete(f.name);
        }
      }
    } else if (check) {
      next.add(file.name);
    } else {
      next.delete(file.name);
    }
    this.anchor = file.name;
    this.shift = false;
    this.selected.set(next);
  }

  /** The header box: all the rows of the page, or none */
  toggleAll() {
    this.selected.set(this.allSelected() ? new Set() : new Set((this.files() ?? []).map((file) => file.name)));
    this.anchor = null;
  }

  clearSelection() {
    if (this.selected().size) {
      this.selected.set(new Set());
    }
    this.anchor = null;
  }

  removeSelected() {
    const chosen = this.selectedFiles();
    if (!chosen.length || this.deleting()) {
      return;
    }
    const folders = chosen.some((file) => file.type === 'directory');
    if (!confirm(`Delete ${this.selectionLabel()}${folders ? ' with everything in them' : ''}? This cannot be undone.`)) {
      return;
    }
    this.deleting.set(true);
    this.http.post<{ deleted: string[]; failed: { path: string; message: string }[] }>('/api/user/files/delete', {
      paths: chosen.map((file) => this.join(file.name)),
    }).subscribe({
      next: ({ deleted, failed }) => {
        this.deleting.set(false);
        const done = `${deleted.length} ${deleted.length === 1 ? 'item' : 'items'} deleted`;
        this.snackBar.open(failed.length ? `${done}, ${failed.length} could not be: ${failed[0].message}` : done, undefined, { duration: failed.length ? 6000 : 3000 });
        this.load();
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.error(err, 'The files could not be deleted');
        this.load();
      },
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
    if (file.video) {
      return 'movie';
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
