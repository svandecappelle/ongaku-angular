import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';

export type ProfileImage = 'avatar' | 'cover' | 'background';

/** Artist of a profile library, the largest first */
export interface ProfileArtist {
  name: string;
  albums: number;
  tracks: number;
}

export interface Profile {
  username: string;
  /** Only on the profile of the connected user */
  email?: string;
  self: boolean;
  administrator: boolean;
  /** Tracks and artists in the user's library */
  tracks: number;
  artistsCount: number;
  playlists: number;
  likes: number;
  /** Only on the profile of the connected user: the others see what he plays */
  shareListening?: boolean;
  /** quota: bytes, only for the user himself (null: no limit) */
  uploads: { files: number; size: number; quota?: number | null };
  artists: ProfileArtist[];
}

@Injectable()
export class UserService {

  constructor(private http: HttpClient) { }

  getMyInfos(): Observable<Profile> {
    return this.http.get<Profile>(`/api/user/me`);
  }

  getUserInfos(username: string): Observable<Profile> {
    return this.http.get<Profile>(`/api/user/${encodeURIComponent(username)}`);
  }

  setShareListening(share: boolean): Observable<{ share: boolean }> {
    return this.http.put<{ share: boolean }>('/api/user/settings/listening', { share });
  }

  resetImage(type: ProfileImage): Observable<unknown> {
    return this.http.delete(`/api/user/image/${type}`);
  }

  uploadImage(type: ProfileImage, file: File): Observable<HttpEvent<unknown>> {
    const formData = new FormData();
    formData.append('upload', file);
    return this.http.request(new HttpRequest('POST', `/api/user/image/${type}`, formData, { reportProgress: true }));
  }
}
