import type { Book as EpubBook, Contents, Location, NavItem, Rendition } from 'epubjs';

import { BookView, ReaderColors, ReaderLocation, TocEntry, ViewClosed, ViewHost } from './book-view';

/** Characters of a "location": the grain of the percentage, and of the slider */
const LOCATION_CHARS = 1200;
/** Two pages side by side from this width */
const SPREAD_WIDTH = 1100;
const STYLES = 'ongaku-reader';
const SWIPE = 50;
const RESIZE_DELAY = 150;

/** "../Text/ch1.xhtml#p3" -> "Text/ch1.xhtml" */
function fileOf(href: string): string {
  return decodeURIComponent(href.split('#')[0]).replace(/^(\.\.?\/)+/, '');
}

/**
 * An EPUB, laid out by epub.js in pages to turn, with the colours of the application. Its
 * chapters are frames without scripts (sandbox). The position is a CFI, a place in the text
 * that holds whatever the size of the pages.
 */
export class EpubView implements BookView {
  readonly zooms = [80, 90, 100, 110, 125, 140, 160, 180, 200];

  private book: EpubBook | null = null;
  private rendition: Rendition | null = null;
  private chapters: { file: string; label: string }[] = [];
  private colors: ReaderColors;
  private zoom: number;
  /** The "locations" are counted: the percentage is exact, and the slider works */
  private located = false;
  private closed = false;
  private resizes: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private touch: { x: number; y: number } | null = null;

  constructor(private readonly host: ViewHost) {
    this.colors = host.colors;
    this.zoom = host.zoom;
  }

  async open(position: string | null): Promise<void> {
    const [{ default: ePub }, data] = await Promise.all([
      import('epubjs'),
      fetch(this.host.url, { credentials: 'same-origin' }).then((response) => {
        if (!response.ok) {
          throw new Error(`The book could not be loaded (${response.status})`);
        }
        return response.arrayBuffer();
      }),
    ]);
    this.alive();
    const book = this.book = ePub(data);
    await book.ready;
    this.alive();

    const rendition = this.rendition = book.renderTo(this.host.element, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
      minSpreadWidth: SPREAD_WIDTH,
      // The chapters are frames without scripts: a book is a text, not a program
      allowScriptedContent: false,
    });
    rendition.hooks.content.register((contents: Contents) => {
      contents.addStylesheetCss(this.css(), STYLES);
    });
    rendition.themes.fontSize(`${this.zooms[this.zoom] ?? 100}%`);
    rendition.on('relocated', (location: Location) => this.report(location));
    rendition.on('keydown', (event: KeyboardEvent) => this.host.key(event));
    rendition.on('touchstart', (event: TouchEvent) => {
      const point = event.changedTouches[0];
      this.touch = point ? { x: point.screenX, y: point.screenY } : null;
    });
    rendition.on('touchend', (event: TouchEvent) => {
      const point = event.changedTouches[0];
      const start = this.touch;
      this.touch = null;
      if (!point || !start) {
        return;
      }
      const dx = point.screenX - start.x;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > 2 * Math.abs(point.screenY - start.y)) {
        dx < 0 ? this.next() : this.previous();
      }
    });

    try {
      await rendition.display(position ?? undefined);
    } catch {
      // A position of another edition of the file
      await rendition.display();
    }
    this.alive();

    this.resizes = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (!this.closed) {
          // No arguments: the size of its element is read again
          (rendition as unknown as { resize(): void }).resize();
        }
      }, RESIZE_DELAY);
    });
    this.resizes.observe(this.host.element);

    // Every chapter is read to count the book: in the background, the reading goes on
    book.locations.generate(LOCATION_CHARS).then(() => {
      if (!this.closed) {
        this.located = true;
        const now = rendition.currentLocation() as unknown as Location;
        if (now?.start) {
          this.report(now);
        }
      }
    }, () => undefined);
  }

  async toc(): Promise<TocEntry[]> {
    const navigation = await this.book?.loaded.navigation;
    const entries: TocEntry[] = [];
    const walk = (items: NavItem[], depth: number) => items.forEach((item) => {
      const label = (item.label ?? '').trim();
      if (label && item.href) {
        entries.push({ label, depth, target: item.href });
      }
      walk(item.subitems ?? [], depth + 1);
    });
    walk(navigation?.toc ?? [], 0);
    this.chapters = entries.map((entry) => ({ file: fileOf(String(entry.target)), label: entry.label }));
    return entries;
  }

  next() {
    this.rendition?.next().catch(() => undefined);
  }

  previous() {
    this.rendition?.prev().catch(() => undefined);
  }

  goTo(target: unknown) {
    const href = String(target);
    // The contents tell their addresses from their own file, the book from its package
    const section = this.book?.spine.get(href) ?? this.book?.spine.get(fileOf(href));
    const fragment = href.includes('#') ? `#${href.split('#')[1]}` : '';
    this.rendition?.display(section ? `${section.href}${fragment}` : href).catch(() => undefined);
  }

  seek(percent: number) {
    if (!this.located || !this.book) {
      return;
    }
    const cfi = this.book.locations.cfiFromPercentage(Math.min(Math.max(percent, 0), 1));
    if (cfi) {
      this.rendition?.display(cfi).catch(() => undefined);
    }
  }

  setZoom(index: number) {
    this.zoom = index;
    this.rendition?.themes.fontSize(`${this.zooms[index] ?? 100}%`);
  }

  setColors(colors: ReaderColors) {
    this.colors = colors;
    const contents = (this.rendition?.getContents() ?? []) as unknown as Contents[];
    contents.forEach((content) => content.addStylesheetCss(this.css(), STYLES));
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.resizeTimer);
    this.resizes?.disconnect();
    try {
      this.book?.destroy();
    } catch {
      // Closed while a chapter was loading
    }
    this.host.element.replaceChildren();
  }

  private alive() {
    if (this.closed) {
      throw new ViewClosed();
    }
  }

  /**
   * The colours of the application on the pages. They win over the ones of the book: black
   * text set by a publisher cannot be read on a dark theme.
   */
  private css(): string {
    const { text, background, accent } = this.colors;
    return `
      html, body { color: ${text} !important; background: ${background} !important; }
      body { font-family: 'Literata Variable', Literata, Georgia, 'Times New Roman', serif; line-height: 1.6; }
      body * { color: inherit !important; background-color: transparent !important; border-color: currentColor !important; }
      a, a * { color: ${accent} !important; }
      img, svg, video { max-width: 100% !important; max-height: 95vh !important; object-fit: contain; }
      ::selection { background: color-mix(in srgb, ${accent} 35%, transparent); }
    `;
  }

  private report(location: Location) {
    const start = location?.start;
    if (!start?.cfi || this.closed) {
      return;
    }
    const percent = this.percentOf(location);
    this.host.located({ position: start.cfi, percent, label: `${Math.round(percent * 100)}%`, chapter: this.chapterOf(start.href) } satisfies ReaderLocation);
  }

  private percentOf(location: Location): number {
    const start = location.start;
    if (location.atEnd) {
      return 1;
    }
    let percent: number;
    if (this.located) {
      percent = Number(this.book!.locations.percentageFromCfi(start.cfi));
    } else {
      // Until the book is counted: by chapter, each of them weighing the same
      const chapters = (this.book!.spine as unknown as { length: number }).length || 1;
      const shown = start.displayed ?? { page: 1, total: 1 };
      percent = (start.index + (shown.page - 1) / Math.max(1, shown.total)) / chapters;
    }
    return Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 0.9999) : 0;
  }

  /** The entry of the contents this file belongs to: the last one that leads to it */
  private chapterOf(href: string | undefined): string | null {
    if (!href) {
      return null;
    }
    const file = fileOf(href);
    const found = this.chapters.filter((chapter) => chapter.file === file || chapter.file.endsWith(`/${file}`) || file.endsWith(`/${chapter.file}`));
    return found.length ? found[0].label : null;
  }
}
