
import {throwError as observableThrowError,  Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';


@Injectable()
export class ArtistService {

  constructor(private http: HttpClient) { }


  get (name): Observable<any> {
    return this.http.get(`/api/audio/artist/${name}`);
  }

  saveImage (name): Observable<any> {
    return this.http.post(`/api/audio/artist-properties/${name}`, {
      action: 'save',
      type: "image"
    });
  }
}
