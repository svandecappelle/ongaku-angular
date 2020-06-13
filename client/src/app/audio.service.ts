
import { throwError as observableThrowError,  Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

export class PageElement {
  artist: string;
  artist_info: {
    name: string;
    url: string;
    image: [
      {
        '#text': string;
        size: string;
      }
    ]
  };

  albums: [
    {
      title: string;
      tracks: Object[];
      album_info: Object;
    }
  ]
}

export class FeaturePage {
  stats: {
    plays: Object[];
  }
}

@Injectable()
export class AudioService {

  filter: String;

  constructor(private http: HttpClient) { }


  get (type, page): Observable<any[]> {
    switch (type) {
      case 'artist':
      return this.getArtists(page);
      case 'album':
        return this.getAlbums(page);
      case 'tracks':
        return this.getTracks(page);
      default:
        return this.getPage(page);
    }
  }

  getPage (page): Observable<any> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/library/filter/${this.filter}/${page}`).pipe(map((page) => page));
    } else {
      return this.http.get(`/api/audio/library/${page}`).pipe(map((page) => page));
    }
  }

  getArtists (page): Observable<any> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/artists/filter/${this.filter}/${page}`)
    } else {
      return this.http.get(`/api/audio/artists/${page}`);
    }
  }

  getAlbums (page): Observable<any> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/albums/filter/${this.filter}/${page}`);
    } else {
      return this.http.get(`/api/audio/albums/${page}`);
    }
  }

  getTracks (page): Observable<any> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/tracks/filter/${this.filter}/${page}`);
    } else {
      return this.http.get(`/api/audio/featured/${page}`)
        .pipe(map(r => r as FeaturePage))
        .pipe(map(page => page.stats.plays));
    }
  }
}
