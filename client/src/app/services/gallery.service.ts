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

  delete(images: GalleryImage[]): Observable<{ deleted: string[]; failed: { path: string; message: string }[] }> {
    return this.http.post<{ deleted: string[]; failed: { path: string; message: string }[] }>('/api/user/files/delete', {
      paths: images.map((image) => image.path),
    });
  }
}
