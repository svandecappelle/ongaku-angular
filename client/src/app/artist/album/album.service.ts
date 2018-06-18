import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable }     from 'rxjs/Observable';


@Injectable()
export class AlbumService {

  constructor(private http: HttpClient) { }


  get (name): Observable<any> {
    return this.http.get(`/api/audio/album/${name}`).map((page) => page)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }
}
