import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams, HttpRequest } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/** An image of the uploads of the connected member (server/app/routes/api/gallery.js) */
export interface GalleryImage {
  /** Path in the uploads folder: its identifier */
  path: string;
  name: string;
  /** Folder in the uploads ("" at their root) */
  folder: string;
  size: number;
  /** Date of the file, in milliseconds */
  modified: number;
}

/** A public link to images (server/app/routes/api/shares.js), as its owner sees it */
export interface ImageShare {
  token: string;
  title: string;
  /** Images of the link still in the uploads */
  count: number;
  created: number;
  /** Milliseconds; null: never */
  expires: number | null;
  expired: boolean;
  views: number;
}

/** A shared link, as anyone opening it sees it */
export interface SharedImages {
  title: string;
  owner: string;
  created: number;
  expires: number | null;
  images: { index: number; name: string; size: number }[];
}

export type ShareExpiry = 0 | 1 | 7 | 30;

/** Folder of the uploads where the Images page puts the images sent from it */
export const IMAGES_FOLDER = 'Images';

@Injectable({ providedIn: 'root' })
export class GalleryService {
  private readonly http = inject(HttpClient);

  list(): Observable<GalleryImage[]> {
    return this.http.get<{ images: GalleryImage[] }>('/api/images').pipe(map(({ images }) => images));
  }

  fileUrl(image: GalleryImage, download = false): string {
    return `/api/images/file?path=${encodeURIComponent(image.path)}${download ? '&download=1' : ''}`;
  }

  /** The thumbnail; the date in the address lets the browser keep it until the file changes */
  thumbUrl(image: GalleryImage, size: 320 | 640 = 320): string {
    return `/api/images/thumb?path=${encodeURIComponent(image.path)}&size=${size}&v=${image.modified}`;
  }

  /** Makes the Images folder of the uploads; already there is fine */
  ensureFolder(): Observable<void> {
    return this.http.post('/api/user/files/folder', { name: IMAGES_FOLDER }).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  upload(file: File): Observable<HttpEvent<{ files: { file: string; imported?: string[]; error?: string }[] }>> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.request(new HttpRequest('POST', '/api/user/files/upload', form, {
      params: new HttpParams({ fromObject: { path: IMAGES_FOLDER } }),
      reportProgress: true,
    }));
  }

  // ---------- Public links ----------

  shares(): Observable<ImageShare[]> {
    return this.http.get<{ shares: ImageShare[] }>('/api/shares').pipe(map(({ shares }) => shares));
  }

  share(images: GalleryImage[], title: string, expiresInDays: ShareExpiry): Observable<ImageShare & { skipped: number }> {
    return this.http.post<ImageShare & { skipped: number }>('/api/shares', { title, expiresInDays, paths: images.map((image) => image.path) });
  }

  revoke(token: string): Observable<unknown> {
    return this.http.delete(`/api/shares/${encodeURIComponent(token)}`);
  }

  /** The address to give: the page of the link */
  shareUrl(token: string): string {
    return `${location.origin}/s/${token}`;
  }

  openShare(token: string): Observable<SharedImages> {
    return this.http.get<SharedImages>(`/api/share/${encodeURIComponent(token)}`);
  }

  sharedImageUrl(token: string, index: number, options: { size?: 320 | 640; download?: boolean } = {}): string {
    const query = options.size ? `?size=${options.size}` : options.download ? '?download=1' : '';
    return `/api/share/${encodeURIComponent(token)}/image/${index}${query}`;
  }

  delete(images: GalleryImage[]): Observable<{ deleted: string[]; failed: { path: string; message: string }[] }> {
    return this.http.post<{ deleted: string[]; failed: { path: string; message: string }[] }>('/api/user/files/delete', {
      paths: images.map((image) => image.path),
    });
  }
}
