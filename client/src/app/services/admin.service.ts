import { throwError as observableThrowError, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { Injectable } from '@angular/core';

import { HttpClient, HttpEvent, HttpParams, HttpRequest } from '@angular/common/http';

/** An account, as listed by the administration */
export interface AdminUser {
  uid: string;
  username: string;
  email: string;
  administrator: boolean;
  banned: boolean;
  lastonline: number | null;
  /** Bytes of the files the user uploaded */
  storage: number;
  /** MB; null: the default quota, 0: unlimited */
  uploadQuota: number | null;
  /** The connected administrator */
  self: boolean;
}

export interface NewUser {
  username: string;
  email: string;
  password: string;
  administrator: boolean;
}

export interface UserChanges {
  password?: string;
  administrator?: boolean;
  banned?: boolean;
  uploadQuota?: number | null;
}

/** Result of an import, per uploaded file: the imported audio files or the error */
export interface ImportResult {
  file: string;
  imported?: string[];
  error?: string;
}

export interface ImportResponse {
  files: ImportResult[];
  /** started: the library is rescanned; busy: a scan was already running */
  rescan: 'none' | 'started' | 'busy';
}

/** A copy of a track, in the duplicates report */
export interface TrackCopy {
  uid: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  /** File format (extension) */
  format: string;
  file: string;
  /** Owner of a private upload */
  user: string | null;
}

/** Music available several times: the copy shown and the hidden ones */
export interface Duplicates {
  enabled: boolean;
  hidden: number;
  /** First 500 groups, by artist, album and title */
  groups: { kept: TrackCopy; copies: TrackCopy[] }[];
  total: number;
}

export interface ImportFolder {
  folder: string;
  writable: boolean;
  scanning: boolean;
}

@Injectable()
export class AdminService {

  constructor(private http: HttpClient) { }

  getProperties(): Observable<any> {
    return this.http.get(`/api/admin/configure`).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }

  configure(opts): Observable<any> {
    return this.http.post(`/api/admin/configure`, opts).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }

  update(): Observable<any> {
    return this.http.post('/api/upgrade/git/check', {}).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }

  restart(): Observable<any> {
    return this.http.post('/api/admin/restart', {}).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }

  users(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>('/api/admin/users');
  }

  createUser(user: NewUser): Observable<unknown> {
    return this.http.post('/api/admin/users', user);
  }

  updateUser(username: string, changes: UserChanges): Observable<unknown> {
    return this.http.put(`/api/admin/users/${encodeURIComponent(username)}`, changes);
  }

  deleteUser(username: string, deleteFiles: boolean): Observable<unknown> {
    return this.http.delete(`/api/admin/users/${encodeURIComponent(username)}`, { params: { files: String(deleteFiles) } });
  }

  /** Image of an artist, or of one of his albums when album is given */
  setImage(file: File, artist: string, album?: string): Observable<unknown> {
    const formData = new FormData();
    formData.append('image', file, file.name);
    return this.http.post('/api/admin/images', formData, { params: this.imageParams(artist, album) });
  }

  resetImage(artist: string, album?: string): Observable<unknown> {
    return this.http.delete('/api/admin/images', { params: this.imageParams(artist, album) });
  }

  private imageParams(artist: string, album?: string) {
    return new HttpParams({ fromObject: album === undefined ? { artist } : { artist, album } });
  }

  duplicates(): Observable<Duplicates> {
    return this.http.get<Duplicates>('/api/admin/library/duplicates');
  }

  importFolder(): Observable<ImportFolder> {
    return this.http.get<ImportFolder>('/api/admin/library/import');
  }

  /** Upload one file (audio or archive) to the public library, in an optional sub folder */
  importFile(file: File, folder: string): Observable<HttpEvent<ImportResponse>> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const params = new HttpParams({ fromObject: folder ? { folder } : {} });
    return this.http.request<ImportResponse>(new HttpRequest('POST', '/api/admin/library/import', formData, { params, reportProgress: true }));
  }
}
