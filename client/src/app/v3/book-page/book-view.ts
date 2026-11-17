/** What the reader page asks of the view of a format (PDF, EPUB) */

/** An entry of the table of contents, sub entries flattened with their depth */
export interface TocEntry {
  label: string;
  depth: number;
  /** Where it leads, as the view understands it */
  target: unknown;
}

/** Where the reader is */
export interface ReaderLocation {
  /** Kept on the server to come back to it: a page of a PDF, a place (CFI) of an EPUB */
  position: string;
  /** From 0 to 1 */
  percent: number;
  /** "Page 12 of 300", "42%" */
  label: string;
  /** Chapter being read, when the book tells it */
  chapter: string | null;
}

/** Colours of the application theme, for the pages of an EPUB */
export interface ReaderColors {
  text: string;
  background: string;
  accent: string;
}

export interface ViewHost {
  /** Where the book is drawn */
  element: HTMLElement;
  /** Address of the file */
  url: string;
  colors: ReaderColors;
  /** Index in the zoom levels of the view */
  zoom: number;
  located(location: ReaderLocation): void;
  /** A key pressed inside the book (the pages of an EPUB are frames of their own) */
  key(event: KeyboardEvent): void;
}

export interface BookView {
  /** Sizes offered by the zoom buttons, as percentages */
  readonly zooms: readonly number[];
  /** Opens the book at a position kept earlier, at its start otherwise */
  open(position: string | null): Promise<void>;
  toc(): Promise<TocEntry[]>;
  next(): void;
  previous(): void;
  goTo(target: unknown): void;
  /** Goes to a share of the book, from 0 to 1 */
  seek(percent: number): void;
  setZoom(index: number): void;
  setColors(colors: ReaderColors): void;
  destroy(): void;
}

/** A view that was closed while it was opening */
export class ViewClosed extends Error {}
