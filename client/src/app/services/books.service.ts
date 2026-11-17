import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams, HttpRequest } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';

/** Folder of the uploads where the Books page puts the books it sends */
export const BOOKS_FOLDER = 'Books';

/** Where a member is in a book */
export interface BookProgress {
  /** Told by the reader: a page of a PDF, a place (CFI) of an EPUB */
  position: string;
  /** From 0 to 1 */
  percent: number;
  /** Date of the last reading, in milliseconds */
  updated: number;
}

/** A book of the library (server/app/routes/api/books.js) */
export interface Book {
  uid: string;
  title: string;
  author: string | null;
  /** File name */
  name: string;
  /** Folder under the music folder holding it ("" at its root) */
  folder: string;
  format: 'pdf' | 'epub';
  /** Bytes */
  size: number;
  /** Date of the file, in milliseconds */
  modified: number;
  /** Pages of a PDF, null when unknown */
  pages: number | null;
  /** An upload: only its owner reads it */
  private: boolean;
  progress: BookProgress | null;
}

export interface UploadAnswer {
  files: { file: string; imported?: string[]; error?: string }[];
}

@Injectable({ providedIn: 'root' })
export class BooksService {
  private readonly http = inject(HttpClient);

  list(): Observable<{ books: Book[]; scanning: boolean }> {
    return this.http.get<{ books: Book[]; scanning: boolean }>('/api/books');
  }

  get(uid: string): Observable<Book> {
    return this.http.get<Book>(`/api/books/${encodeURIComponent(uid)}`);
  }

  fileUrl(uid: string, download = false): string {
    return `/api/books/${encodeURIComponent(uid)}/file${download ? '?download=1' : ''}`;
  }

  coverUrl(book: Pick<Book, 'uid' | 'modified'>): string {
    // The date of the file: a replaced book shows its new cover
    return `/api/books/${encodeURIComponent(book.uid)}/cover?v=${book.modified}`;
  }

  progressUrl(uid: string): string {
    return `/api/books/${encodeURIComponent(uid)}/progress`;
  }

  saveProgress(uid: string, position: string, percent: number): Observable<BookProgress> {
    return this.http.put<BookProgress>(this.progressUrl(uid), { position, percent });
  }

  /** Back to "not started" */
  forgetProgress(uid: string): Observable<unknown> {
    return this.http.delete(this.progressUrl(uid));
  }

  /** Makes the Books folder of the uploads; already there is fine */
  ensureFolder(): Observable<void> {
    return this.http.post('/api/user/files/folder', { name: BOOKS_FOLDER }).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  upload(file: File): Observable<HttpEvent<UploadAnswer>> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.request<UploadAnswer>(new HttpRequest('POST', '/api/user/files/upload', form, {
      params: new HttpParams({ fromObject: { path: BOOKS_FOLDER } }),
      reportProgress: true,
    }));
  }
}

/** A PDF or an EPUB, by the name of the file: browsers do not always tell the type of an EPUB */
export function isBookFile(file: Pick<File, 'name'>): boolean {
  return /\.(pdf|epub)$/i.test(file.name);
}

/** 0.4267 -> 43; a started book never shows 0, an unfinished one never 100 */
export function progressPercent(progress: BookProgress | null): number {
  if (!progress) {
    return 0;
  }
  return progress.percent >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(progress.percent * 100)));
}
