import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable }     from 'rxjs/Observable';

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

@Injectable()
export class AudioService {

  filter: String;

  constructor(private http:HttpClient) { }


  get (type, page): Observable<any[]> {
    switch (type){
      case 'artist':
      return this.getArtists(page);
      case 'album':
        return this.getAlbums(page);
      default:
        return this.getPage(page);
    }
  }

  getPage (page): Observable<PageElement[]> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/library/filter/${this.filter}/${page}`).map((page) => page)
        .catch((error:any) => Observable.throw(error || 'Server error'));
    } else {
      return this.http.get(`/api/audio/library/${page}`).map((page) => page)
        .catch((error:any) => Observable.throw(error || 'Server error'));;
    }
  }

  getArtists (page): Observable<PageElement[]> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/artists/library/filter/${this.filter}/${page}`).map((page) => page)
        .catch((error:any) => Observable.throw(error || 'Server error'));
    } else {
      return this.http.get(`/api/audio/artists/library/${page}`).map((page) => page)
        .catch((error:any) => Observable.throw(error || 'Server error'));;
    }
  }

  getAlbums (page): Observable<PageElement[]> {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/albums/library/filter/${this.filter}/${page}`).map((page) => page)
        .catch((error:any) => Observable.throw(error || 'Server error'));
    } else {
      return this.http.get(`/api/audio/albums/library/${page}`).map((page) => page)
        .catch((error:any) => Observable.throw(error || 'Server error'));;
    }
  }
}
