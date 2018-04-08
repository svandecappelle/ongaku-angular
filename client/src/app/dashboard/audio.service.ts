import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable()
export class AudioService {

  constructor(private http:HttpClient) { }

  getArtists() {
    return this.http.get('/api/audio/library/0');
  }
}
