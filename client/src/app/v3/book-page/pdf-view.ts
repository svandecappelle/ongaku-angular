import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { BookView, ReaderColors, TocEntry, ViewClosed, ViewHost } from './book-view';

/** Files of pdf.js copied by the build (angular.json): its worker, fonts and decoders */
const ASSETS = '/assets/pdfjs/';
/** Width of a page at 100%, when the window is wider */
const MAX_WIDTH = 960;
/** Room around the pages */
const PADDING = 16;
/** Pixels of a page drawn at most: a huge zoom on a huge screen must not take all the memory */
const MAX_PIXELS = 16_000_000;
const RESIZE_DELAY = 150;

interface Slot {
  number: number;
  element: HTMLDivElement;
  /** Height by width of the page: the one of the first page until it is read */
  ratio: number;
  /** Width, in CSS pixels, of what is drawn (0: nothing) */
  drawn: number;
  /** Counts the drawings asked: an older one gives up */
  job: number;
  task: RenderTask | null;
}

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

/**
 * A PDF, drawn by pdf.js: its pages one under the other, drawn when they come near the
 * window and dropped when they leave it. The position is the number of the page.
 */
export class PdfView implements BookView {
  readonly zooms = [50, 67, 80, 90, 100, 125, 150, 200, 300];

  private task: PDFDocumentLoadingTask | null = null;
  private doc: PDFDocumentProxy | null = null;
  private slots: Slot[] = [];
  private readonly near = new Set<Slot>();
  private pages!: HTMLDivElement;
  private observer: IntersectionObserver | null = null;
  private resizes: ResizeObserver | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private width = 0;
  private zoom: number;
  private page = 0;
  private closed = false;
  private readonly onScroll = () => {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.report();
      });
    }
  };

  constructor(private readonly host: ViewHost) {
    this.zoom = host.zoom;
  }

  private get scroller(): HTMLElement {
    return this.host.element;
  }

  async open(position: string | null): Promise<void> {
    const pdfjs = await import('pdfjs-dist');
    this.alive();
    pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}pdf.worker.min.mjs`;
    this.task = pdfjs.getDocument({
      url: this.host.url,
      cMapUrl: `${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
      iccUrl: `${ASSETS}iccs/`,
    });
    this.doc = await this.task.promise;
    this.alive();
    const first = (await this.doc.getPage(1)).getViewport({ scale: 1 });
    this.alive();

    this.pages = document.createElement('div');
    this.pages.className = 'pdf-pages';
    this.slots = Array.from({ length: this.doc.numPages }, (_, index) => {
      const element = document.createElement('div');
      element.className = 'pdf-page';
      element.dataset['page'] = String(index + 1);
      this.pages.append(element);
      return { number: index + 1, element, ratio: first.height / first.width, drawn: 0, job: 0, task: null };
    });
    this.scroller.replaceChildren(this.pages);
    this.layout();

    const bySlot = new Map(this.slots.map((slot) => [slot.element as Element, slot]));
    // Drawn a screen ahead, in both directions
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const slot = bySlot.get(entry.target)!;
        if (entry.isIntersecting) {
          this.near.add(slot);
          this.draw(slot);
        } else {
          this.near.delete(slot);
          this.drop(slot);
        }
      }
    }, { root: this.scroller, rootMargin: '100% 0px' });
    this.slots.forEach((slot) => this.observer!.observe(slot.element));

    const wanted = Math.round(Number(position));
    this.scrollTo(Number.isFinite(wanted) ? wanted : 1);
    this.report(true);
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.resizes = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.relayout(), RESIZE_DELAY);
    });
    this.resizes.observe(this.scroller);
  }

  async toc(): Promise<TocEntry[]> {
    const outline = ((await this.doc?.getOutline()) ?? []) as unknown as OutlineNode[];
    const entries: TocEntry[] = [];
    const walk = (nodes: OutlineNode[], depth: number) => nodes.forEach((node) => {
      if (node.dest && node.title?.trim()) {
        entries.push({ label: node.title.trim(), depth, target: node.dest });
      }
      walk(node.items ?? [], depth + 1);
    });
    walk(outline, 0);
    return entries;
  }

  next() {
    this.scrollTo(this.page + 1);
  }

  previous() {
    // Inside a page: back to its top first
    const slot = this.slots[this.page - 1];
    const inside = slot && this.scroller.scrollTop - slot.element.offsetTop > this.scroller.clientHeight / 2;
    this.scrollTo(inside ? this.page : this.page - 1);
  }

  goTo(target: unknown) {
    this.resolve(target).then((page) => {
      if (page && !this.closed) {
        this.scrollTo(page);
      }
    }, () => undefined);
  }

  seek(percent: number) {
    this.scrollTo(Math.round(percent * this.slots.length) || 1);
  }

  setZoom(index: number) {
    this.zoom = index;
    this.relayout();
  }

  setColors(_colors: ReaderColors) {
    // The pages of a PDF keep their own colours
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.resizeTimer);
    cancelAnimationFrame(this.frame);
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.observer?.disconnect();
    this.resizes?.disconnect();
    this.slots.forEach((slot) => slot.task?.cancel());
    this.task?.destroy().catch(() => undefined);
    this.scroller.replaceChildren();
  }

  private alive() {
    if (this.closed) {
      throw new ViewClosed();
    }
  }

  /** Page of a destination of the outline: a name, or [page reference, ...] */
  private async resolve(target: unknown): Promise<number | null> {
    const doc = this.doc;
    if (!doc) {
      return null;
    }
    const dest = typeof target === 'string' ? await doc.getDestination(target) : target;
    if (!Array.isArray(dest) || dest[0] === null || dest[0] === undefined) {
      return null;
    }
    return typeof dest[0] === 'object' ? (await doc.getPageIndex(dest[0])) + 1 : Number(dest[0]) + 1;
  }

  /** Gives the pages their size: the width of the window at 100%, never wider than MAX_WIDTH */
  private layout() {
    const available = Math.max(160, Math.min(this.scroller.clientWidth - 2 * PADDING, MAX_WIDTH));
    this.width = Math.round(available * (this.zooms[this.zoom] ?? 100) / 100);
    for (const slot of this.slots) {
      this.size(slot);
    }
  }

  private size(slot: Slot) {
    slot.element.style.width = `${this.width}px`;
    slot.element.style.height = `${Math.round(this.width * slot.ratio)}px`;
  }

  /** New size of the window or new zoom: the same place of the same page stays in sight */
  private relayout() {
    if (this.closed || !this.slots.length) {
      return;
    }
    const slot = this.slots[Math.max(0, this.page - 1)];
    const within = slot.element.offsetHeight ? (this.scroller.scrollTop - slot.element.offsetTop) / slot.element.offsetHeight : 0;
    const before = this.width;
    this.layout();
    if (this.width === before) {
      return;
    }
    this.scroller.scrollTop = slot.element.offsetTop + within * slot.element.offsetHeight;
    this.near.forEach((near) => this.draw(near));
  }

  private scrollTo(page: number) {
    const slot = this.slots[Math.min(Math.max(page, 1), this.slots.length) - 1];
    if (slot) {
      this.scroller.scrollTop = slot.element.offsetTop - PADDING / 2;
      this.report();
    }
  }

  /** The page under the upper part of the window; the last one at the end of the book */
  private current(): number {
    const scroller = this.scroller;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2 && scroller.scrollTop > 0) {
      return this.slots.length;
    }
    const line = scroller.scrollTop + scroller.clientHeight * 0.35;
    let low = 0;
    let high = this.slots.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.slots[middle].element.offsetTop <= line) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low + 1;
  }

  private report(always = false) {
    const page = this.current();
    if (page === this.page && !always) {
      return;
    }
    this.page = page;
    const total = this.slots.length;
    this.host.located({ position: String(page), percent: page / total, label: `Page ${page} of ${total}`, chapter: null });
  }

  private async draw(slot: Slot) {
    const width = this.width;
    if (!this.doc || slot.drawn === width) {
      return;
    }
    const job = ++slot.job;
    slot.task?.cancel();
    try {
      const page = await this.doc.getPage(slot.number);
      const stale = () => this.closed || slot.job !== job || !this.near.has(slot);
      if (stale()) {
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const ratio = base.height / base.width;
      if (Math.abs(ratio - slot.ratio) > 0.002) {
        // Not the shape of the first page: the pages below move, the one being read stays
        const reading = this.slots[this.page - 1];
        const offset = reading ? this.scroller.scrollTop - reading.element.offsetTop : 0;
        slot.ratio = ratio;
        this.size(slot);
        if (reading && slot.number < reading.number) {
          this.scroller.scrollTop = reading.element.offsetTop + offset;
        }
      }
      let scale = (width / base.width) * (window.devicePixelRatio || 1);
      const pixels = base.width * base.height * scale * scale;
      if (pixels > MAX_PIXELS) {
        scale *= Math.sqrt(MAX_PIXELS / pixels);
      }
      const viewport = page.getViewport({ scale });
      // Drawn aside, shown once complete: no white flash when the zoom changes
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      slot.task = page.render({ canvas, viewport });
      await slot.task.promise;
      if (stale()) {
        return;
      }
      slot.task = null;
      slot.element.replaceChildren(canvas);
      slot.drawn = width;
    } catch (err) {
      // Cancelled (the page left the window, the zoom changed), or a page that cannot be drawn
      if (slot.job === job) {
        slot.task = null;
        if ((err as Error)?.name !== 'RenderingCancelledException' && !this.closed) {
          slot.element.classList.add('failed');
        }
      }
    }
  }

  /** Far from the window: its picture is given back */
  private drop(slot: Slot) {
    slot.job++;
    slot.task?.cancel();
    slot.task = null;
    slot.drawn = 0;
    const canvas = slot.element.querySelector('canvas');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    slot.element.replaceChildren();
  }
}
