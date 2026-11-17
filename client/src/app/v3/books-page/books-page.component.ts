import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, concatMap, from, last, of, tap } from 'rxjs';

import { MaterialModule } from '../../modules/material.module';
import { BOOKS_FOLDER, Book, BooksService, isBookFile, progressPercent } from '../../services/books.service';
import { folderLabel, formatSize } from '../../services/video.service';
import { LibraryEventsService } from '../../services/library-events.service';

type Load = 'loading' | 'error' | 'ready';
type Format = '' | Book['format'];

/** Books being read shown first, at most */
const CONTINUE = 6;

/** Lower case, without accents: "Été" matches "ete" */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Books page: the PDF and EPUB files of the music folders and of the uploads of the member,
 * by folder, to read in the browser. The ones being read come first.
 */
@Component({
  selector: 'app-books-page',
  templateUrl: './books-page.component.html',
  styleUrls: ['./books-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, RouterLink, NgTemplateOutlet],
  host: {
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class BooksPageComponent {
  readonly service = inject(BooksService);
  private readonly snackBar = inject(MatSnackBar);

  readonly status = signal<Load>('loading');
  readonly books = signal<Book[]>([]);
  readonly scanning = signal(false);
  readonly search = signal('');
  readonly format = signal<Format>('');
  /** Books without a cover image: their title on a plain cover instead */
  readonly withoutCover = signal<ReadonlySet<string>>(new Set());
  readonly uploading = signal<{ done: number; total: number; percent: number } | null>(null);
  readonly dragging = signal(false);

  /** Both formats are there: the choice between them is offered */
  readonly formats = computed(() => new Set(this.books().map((book) => book.format)).size > 1);
  readonly filtering = computed(() => !!this.search().trim() || !!this.format());

  readonly shown = computed(() => {
    const words = normalize(this.search().trim()).split(/\s+/).filter(Boolean);
    const format = this.format();
    return this.books().filter((book) => {
      if (format && book.format !== format) {
        return false;
      }
      const text = normalize(`${book.title} ${book.author ?? ''} ${book.name} ${book.folder}`);
      return words.every((word) => text.includes(word));
    });
  });

  /** Started and not finished, the last one read first; not while searching */
  readonly reading = computed(() => this.filtering() ? [] : this.books()
    .filter((book) => book.progress && book.progress.percent < 1)
    .sort((a, b) => b.progress!.updated - a.progress!.updated)
    .slice(0, CONTINUE));

  /** The shown books by folder, each by title */
  readonly folders = computed(() => {
    const groups = new Map<string, Book[]>();
    for (const book of this.shown()) {
      groups.set(book.folder, [...(groups.get(book.folder) ?? []), book]);
    }
    return [...groups]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
      .map(([path, books]) => ({ path, label: folderLabel(path), books }));
  });

  readonly formatSize = formatSize;
  readonly percent = progressPercent;

  constructor() {
    this.load();
    // Books added or deleted in the music folders: the list is loaded again, in place
    const events = inject(LibraryEventsService);
    effect(() => {
      if (events.version()) {
        untracked(() => this.load(true));
      }
    });
  }

  load(quietly = false) {
    if (!quietly) {
      this.status.set('loading');
    }
    this.service.list().subscribe({
      next: ({ books, scanning }) => {
        this.books.set(books);
        this.scanning.set(scanning);
        this.status.set('ready');
      },
      error: () => {
        if (!quietly) {
          this.status.set('error');
        }
      },
    });
  }

  coverFailed(uid: string) {
    this.withoutCover.update((set) => new Set(set).add(uid));
  }

  clearFilters() {
    this.search.set('');
    this.format.set('');
  }

  /** "Page 12 of 300 · 4%" told to the screen readers, with the title */
  label(book: Book): string {
    const parts = [book.title];
    if (book.author) {
      parts.push(`by ${book.author}`);
    }
    if (book.progress) {
      parts.push(book.progress.percent >= 1 ? 'finished' : `${progressPercent(book.progress)}% read`);
    }
    return parts.join(', ');
  }

  // ---------- Uploads ----------

  addFiles(files: FileList | File[] | null) {
    const chosen = Array.from(files ?? []).filter(isBookFile);
    const skipped = (files?.length ?? 0) - chosen.length;
    if (skipped) {
      this.snackBar.open(`${skipped} ${skipped === 1 ? 'file is' : 'files are'} neither a PDF nor an EPUB: left out`, undefined, { duration: 4000 });
    }
    if (!chosen.length || this.uploading()) {
      return;
    }
    this.uploading.set({ done: 0, total: chosen.length, percent: 0 });
    const errors: string[] = [];
    this.service.ensureFolder().pipe(
      concatMap(() => from(chosen)),
      // One file after the other: one request each, its progress shown
      concatMap((file) => this.service.upload(file).pipe(
        tap((event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploading.update((state) => state && { ...state, percent: Math.round((100 * event.loaded) / event.total!) });
          } else if (event.type === HttpEventType.Response) {
            const result = event.body?.files?.[0];
            if (result?.error) {
              errors.push(`${file.name}: ${result.error}`);
            }
            this.uploading.update((state) => state && { ...state, done: state.done + 1, percent: 0 });
          }
        }),
        last(),
        catchError((err) => {
          errors.push(`${file.name}: ${err.error?.message || 'upload failed'}`);
          this.uploading.update((state) => state && { ...state, done: state.done + 1, percent: 0 });
          return of(null);
        }),
      )),
    ).subscribe({
      complete: () => this.uploaded(chosen.length, errors),
      error: () => this.uploaded(chosen.length, errors),
    });
  }

  private uploaded(total: number, errors: string[]) {
    this.uploading.set(null);
    const added = total - errors.length;
    this.snackBar.open(errors.length
      ? `${added} of ${total} added. ${errors[0]}`
      : `${added} ${added === 1 ? 'book' : 'books'} added to ${BOOKS_FOLDER}, in your uploads`, undefined, { duration: errors.length ? 6000 : 3000 });
    this.load(true);
  }

  onDragOver(event: DragEvent) {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dragging.set(true);
    }
  }

  onDragLeave(event: DragEvent) {
    if (!event.relatedTarget || !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
      this.dragging.set(false);
    }
  }

  onDrop(event: DragEvent) {
    if (!event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    this.dragging.set(false);
    this.addFiles(event.dataTransfer.files);
  }
}
