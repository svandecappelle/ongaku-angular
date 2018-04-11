import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable()
export class AudioService {

  constructor(private http:HttpClient) { }

  getArtists (page) {
    return this.http.get(`/api/audio/library/${page}`);
  }
}
