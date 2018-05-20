import { Injectable } from '@angular/core';

import { HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable()
export class AudioService {

  filter: String;

  constructor(private http:HttpClient) { }

  getPage (page) {
    if (this.filter && this.filter !== '') {
      return this.http.get(`/api/audio/library/filter/${this.filter}/${page}`);
    } else {
      return this.http.get(`/api/audio/library/${page}`);
    }
  }
}
