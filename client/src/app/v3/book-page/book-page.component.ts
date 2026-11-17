import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';

import { MaterialModule } from '../../modules/material.module';
import { Book, BooksService } from '../../services/books.service';
import { PlaybackService } from '../../services/playback.service';
import { ThemeService } from '../../services/theme.service';
import { BookView, ReaderColors, ReaderLocation, TocEntry, ViewClosed, ViewHost } from './book-view';

type Load = { status: 'loading' } | { status: 'error'; notFound: boolean } | { status: 'ready' };
/** The file being opened by its view, after the book itself is known */
type Opening = 'opening' | 'open' | 'failed';

/** The position is kept on the server this long after the last page turned */
const SAVE_DELAY = 1500;
const ZOOM_KEY = 'ongaku.reader.zoom.';
/** Class of the body while a book is open (see content.component.scss) */
const READING = 'ongaku-reading';

/**
 * A book, read in the window: over the whole of it, the music going on behind. A PDF is
 * scrolled, an EPUB has its pages turned; the place reached is kept for the next time, on
 * every device of the member.
 */
@Component({
  selector: 'app-book-page',
  templateUrl: './book-page.component.html',
  styleUrls: ['./book-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
  host: {
    '(document:keydown)': 'onKey($event)',
    '(window:pagehide)': 'flush(true)',
    '(document:fullscreenchange)': 'fullscreen.set(!!document.fullscreenElement)',
  },
})
export class BookPageComponent {
  readonly service = inject(BooksService);
  readonly playback = inject(PlaybackService);
  readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  readonly load = signal<Load>({ status: 'loading' });
  readonly book = signal<Book | null>(null);
  readonly opening = signal<Opening>('opening');
  readonly location = signal<ReaderLocation | null>(null);
  readonly toc = signal<TocEntry[]>([]);
  readonly tocOpen = signal(false);
  readonly zoom = signal(0);
  readonly zooms = signal<readonly number[]>([]);
  readonly fullscreen = signal(false);
  /** The slider being dragged: its value, before the book follows */
  readonly seeking = signal<number | null>(null);

  readonly percent = computed(() => Math.round((this.seeking() ?? this.location()?.percent ?? 0) * 1000) / 10);
  readonly epub = computed(() => this.book()?.format === 'epub');

  private view: BookView | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Reached, and not kept on the server yet */
  private unsaved: ReaderLocation | null = null;

  constructor() {
    this.document.body.classList.add(READING);
    inject(DestroyRef).onDestroy(() => {
      this.flush();
      this.close();
      this.document.body.classList.remove(READING);
    });

    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('uid') ?? ''),
      switchMap((uid) => {
        this.flush();
        this.close();
        this.load.set({ status: 'loading' });
        return this.service.get(uid).pipe(catchError((err: HttpErrorResponse) => of(err)));
      }),
      takeUntilDestroyed(),
    ).subscribe((answer) => {
      if (answer instanceof HttpErrorResponse) {
        this.book.set(null);
        this.load.set({ status: 'error', notFound: answer.status === 404 });
        return;
      }
      this.book.set(answer);
      this.load.set({ status: 'ready' });
    });

    // Once the book is known and its stage is in the page: the view of its format opens it
    effect(() => {
      const book = this.book();
      const stage = this.stage()?.nativeElement;
      if (book && stage) {
        untracked(() => this.open(book, stage));
      }
    });

    // The pages of an EPUB wear the colours of the theme, and change with it
    effect(() => {
      this.theme.active();
      // After the theme wrote its colours on the page
      setTimeout(() => this.view?.setColors(this.colors()));
    });
  }

  private async open(book: Book, element: HTMLElement) {
    this.close();
    this.opening.set('opening');
    const host: ViewHost = {
      element,
      url: this.service.fileUrl(book.uid),
      colors: this.colors(),
      zoom: 0,
      located: (location) => this.located(location),
      key: (event) => this.onKey(event),
    };
    // Each format with its code, loaded when a book of it is opened
    const view: BookView = book.format === 'epub'
      ? new (await import('./epub-view')).EpubView(host)
      : new (await import('./pdf-view')).PdfView(host);
    if (this.book() !== book) {
      return;
    }
    this.view = view;
    const stored = Number(this.stored(`${ZOOM_KEY}${book.format}`));
    const start = Number.isInteger(stored) && stored >= 0 && stored < view.zooms.length && this.stored(`${ZOOM_KEY}${book.format}`) !== null
      ? stored
      : view.zooms.indexOf(100);
    this.zooms.set(view.zooms);
    this.zoom.set(start);
    view.setZoom(start);
    try {
      await view.open(book.progress?.position ?? null);
      if (this.view !== view) {
        return;
      }
      this.opening.set('open');
      element.focus({ preventScroll: true });
      this.toc.set(await view.toc().catch(() => []));
    } catch (err) {
      if (!(err instanceof ViewClosed) && this.view === view) {
        console.error('The book could not be opened', err);
        this.opening.set('failed');
      }
    }
  }

  private close() {
    clearTimeout(this.saveTimer);
    this.view?.destroy();
    this.view = null;
    this.location.set(null);
    this.toc.set([]);
    this.tocOpen.set(false);
    this.seeking.set(null);
  }

  /** The colours of the theme, as the page has them now */
  private colors(): ReaderColors {
    const style = getComputedStyle(this.document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return { text: read('--ongaku-text', '#222'), background: read('--ongaku-surface', '#fff'), accent: read('--ongaku-accent', '#06c') };
  }

  private stored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  // ---------- Position ----------

  private located(location: ReaderLocation) {
    const first = !this.location();
    this.location.set(location);
    this.seeking.set(null);
    // Opening a book where it was left changes nothing
    if (first && this.book()?.progress?.position === location.position) {
      return;
    }
    this.unsaved = location;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY);
  }

  /** Keeps the position reached; `leaving`: the page is going away, the request must outlive it */
  flush(leaving = false) {
    clearTimeout(this.saveTimer);
    const book = this.book();
    const location = this.unsaved;
    if (!book || !location) {
      return;
    }
    this.unsaved = null;
    if (leaving) {
      fetch(this.service.progressUrl(book.uid), {
        method: 'PUT',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: location.position, percent: location.percent }),
      }).catch(() => undefined);
      return;
    }
    this.service.saveProgress(book.uid, location.position, location.percent).subscribe({
      // Kept by the next page turned
      error: () => undefined,
    });
  }

  // ---------- Controls ----------

  next() {
    this.view?.next();
  }

  previous() {
    this.view?.previous();
  }

  goTo(entry: TocEntry) {
    this.view?.goTo(entry.target);
    this.tocOpen.set(false);
    this.stage()?.nativeElement.focus({ preventScroll: true });
  }

  onSeekInput(value: string) {
    this.seeking.set(Number(value) / 100);
  }

  onSeek(value: string) {
    this.view?.seek(Number(value) / 100);
  }

  zoomBy(step: number) {
    const index = Math.min(Math.max(this.zoom() + step, 0), this.zooms().length - 1);
    if (index === this.zoom()) {
      return;
    }
    this.zoom.set(index);
    this.view?.setZoom(index);
    const format = this.book()?.format;
    try {
      localStorage.setItem(`${ZOOM_KEY}${format}`, String(index));
    } catch {
      // Private browsing: kept for this book only
    }
  }

  toggleFullscreen() {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen().catch(() => undefined);
    } else {
      this.root.nativeElement.requestFullscreen?.().catch(() => undefined);
    }
  }

  /** Keys of the window, and the ones pressed inside the pages of an EPUB */
  onKey(event: KeyboardEvent) {
    if (!this.view || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) {
      return;
    }
    // A PDF scrolls by itself with the other keys; the pages of an EPUB are turned
    const turning = this.epub();
    switch (event.key) {
      case 'ArrowRight':
        this.next();
        break;
      case 'ArrowLeft':
        this.previous();
        break;
      case 'PageDown':
      case 'ArrowDown':
      case ' ':
        if (!turning || (event.key === ' ' && ['BUTTON', 'A'].includes(target?.tagName ?? ''))) {
          return;
        }
        event.shiftKey ? this.previous() : this.next();
        break;
      case 'PageUp':
      case 'ArrowUp':
        if (!turning) {
          return;
        }
        this.previous();
        break;
      case '+':
      case '=':
        this.zoomBy(1);
        break;
      case '-':
        this.zoomBy(-1);
        break;
      case 'Escape':
        if (!this.tocOpen()) {
          return;
        }
        this.tocOpen.set(false);
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
