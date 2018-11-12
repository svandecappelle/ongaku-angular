
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';


@Injectable()
export class InstallService {

  constructor(private http: HttpClient) { }

  check (): Observable<any> {
    return this.http.get(`/api/install`);
  }

  install (opts): Observable<any> {
    return this.http.post(`/api/install`, opts);
  }
}
