import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** A video of the library (server/app/routes/api/video.js) */
export interface Video {
  uid: string;
  title: string;
  /** File name */
  name: string;
  /** Folder under the music folder holding it ("" at its root) */
  folder: string;
  extension: string;
  mime: string;
  /** Bytes */
  size: number;
  /** Date of the file, in milliseconds */
  modified: number;
  /** Seconds, null when it could not be read */
  duration: number | null;
  width: number | null;
  height: number | null;
  /** The browsers play it as it is (else: downloaded) */
  playable: boolean;
  private: boolean;
}

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly http = inject(HttpClient);

  list(): Observable<{ videos: Video[]; scanning: boolean }> {
    return this.http.get<{ videos: Video[]; scanning: boolean }>('/api/video');
  }

  get(uid: string): Observable<Video> {
    return this.http.get<Video>(`/api/video/${encodeURIComponent(uid)}`);
  }

  streamUrl(uid: string): string {
    return `/api/video/${encodeURIComponent(uid)}/stream`;
  }

  posterUrl(uid: string): string {
    return `/api/video/${encodeURIComponent(uid)}/poster`;
  }
}

/** 1536000 -> "1.5 MB" */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 1080 -> "1080p", 2160 -> "4K"; null when the height is unknown */
export function formatResolution(video: Pick<Video, 'width' | 'height'>): string | null {
  if (!video.height) {
    return null;
  }
  return video.height >= 2000 ? '4K' : `${video.height}p`;
}

/** Name of a folder for the headings: its last part, "Library" at the root */
export function folderLabel(folder: string): string {
  return folder ? folder.split('/').pop()! : 'Library';
}
