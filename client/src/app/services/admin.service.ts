import { throwError as observableThrowError, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { Injectable } from '@angular/core';

import { HttpClient, HttpEvent, HttpHeaders, HttpParams, HttpRequest } from '@angular/common/http';

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

/** Tags written by the tag editor */
export interface TrackTags {
  artist: string;
  album: string;
  title: string;
  track: string;
  date: string;
  genre: string;
}

/** Problems of the public library (Administration > Health) */
export interface LibraryHealth {
  scanning: boolean;
  counts: { withoutCover: number; missingTags: number; duplicates: number; unreadable: number };
  /** Lists hold the first 500 items */
  /** artist: of the album; coverArtist: the one its cover is stored under */
  withoutCover: { artist: string; coverArtist: string; album: string; tracks: number }[];
  missingTags: { uid: string; title: string; artist: string; album: string; file: string; missing: ('artist' | 'album' | 'title')[]; tags: Partial<TrackTags> }[];
  unreadable: { file: string; error: string }[];
}

/** What a backup holds (Administration > Backup); sizes in bytes */
export interface BackupSummary {
  /** A backup or a restore running */
  busy: 'backup' | 'restore' | null;
  database: { keys: number };
  data: { name: 'user' | 'artists-covers' | 'lyrics'; size: number }[];
  music: { index: number; path: string; exists: boolean; writable: boolean; size: number }[];
}

/** The parts of a backup: "data" (database, data folders, configuration) and "music" */
export type BackupPart = 'data' | 'music';

/** The manifest at the start of a backup file */
export interface BackupManifest {
  format: string;
  version: number;
  createdAt: string;
  application: string;
  /** Missing in the backups made before the parts existed */
  parts?: BackupPart[];
  database: { keys: number } | null;
  data: string[];
  music: { index: number; name: string; path: string }[];
}

/** What a restore did */
export interface RestoreReport {
  parts: BackupPart[];
  database: number;
  data: string[];
  music: { files: number; skipped: number; folders: { index: number; path: string; writable: boolean }[] };
  ignored: number;
  rescan: 'started' | 'busy';
  manifest?: { createdAt: string; application: string };
}

/** The music folders against the library (Administration > Files); lists hold the first 500 items */
export interface LibraryAudit {
  scanning: boolean;
  folders: { path: string; exists: boolean; files: number }[];
  counts: { audio: number; listed: number; duplicates: number; unreadable: number; notScanned: number; disabledFormat: number; missing: number; other: number };
  /** Supported audio files the library does not hold: added since the scan, or skipped by older scans */
  notScanned: { file: string; folder: string; reason: 'after-scan' | 'uppercase-extension' }[];
  /** Audio files of a format the configuration does not enable */
  disabledFormat: { file: string; folder: string; format: string }[];
  unreadable: { file: string; folder: string; error: string }[];
  /** Hidden copies, with the file listed instead */
  duplicates: { file: string; folder: string; title: string; artist: string; album: string; keptFile: string | null }[];
  /** Tracks of the library whose file is gone */
  missing: { file: string; title: string; artist: string; album: string }[];
  /** Other files, by extension */
  other: Record<string, number>;
  enabledFormats: string[];
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

  health(): Observable<LibraryHealth> {
    return this.http.get<LibraryHealth>('/api/admin/library/health');
  }

  audit(): Observable<LibraryAudit> {
    return this.http.get<LibraryAudit>('/api/admin/library/audit');
  }

  backupSummary(): Observable<BackupSummary> {
    return this.http.get<BackupSummary>('/api/admin/backup/summary');
  }

  /** Address of a backup file: the browser downloads it (it can be very large) */
  backupUrl(part: BackupPart | 'all'): string {
    return `/api/admin/backup?part=${part}`;
  }

  /**
   * The manifest of a backup file, read in the browser before sending it: the first entry of the
   * tar file (a 512 byte header, then its content). Null when the file is not an Ongaku backup.
   */
  async readBackupManifest(file: File): Promise<BackupManifest | null> {
    try {
      const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
      const text = (from: number, length: number) => new TextDecoder().decode(header.subarray(from, from + length)).replace(/\0.*$/s, '').trim();
      const size = parseInt(text(124, 12), 8);
      if (text(0, 100) !== 'manifest.json' || !(size > 0) || size > 1024 * 1024) {
        return null;
      }
      const manifest = JSON.parse(await file.slice(512, 512 + size).text()) as BackupManifest;
      return manifest?.format === 'ongaku-backup' ? manifest : null;
    } catch {
      return null;
    }
  }

  /** Restores a backup: the .tar file is sent as it is, with the progress of the upload */
  restoreBackup(file: File): Observable<HttpEvent<RestoreReport>> {
    return this.http.request<RestoreReport>(new HttpRequest('POST', '/api/admin/backup/restore', file, {
      headers: new HttpHeaders({ 'Content-Type': 'application/x-tar' }),
      reportProgress: true,
    }));
  }

  /** Rescans the music folders in the background */
  rescanLibrary(): Observable<{ rescan: 'started' | 'busy' }> {
    return this.http.post<{ rescan: 'started' | 'busy' }>('/api/admin/library/rescan', {});
  }

  writeTags(uids: string[], tags: Partial<TrackTags>): Observable<unknown> {
    return this.http.put('/api/audio/metadata/selection/set/', { ids: uids, metadatas: tags });
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
