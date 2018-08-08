import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';


@Injectable()
export class InstallService {

  constructor(private http: HttpClient) { }

  check (): Observable<any> {
    return this.http.get(`/api/install`).map((object) => object)
    .catch((error: any) => Observable.throw(error || 'Server error'));
  }

  install (): Observable<any> {
    return this.http.post(`/api/install`, {}, {}).map((object) => object)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }
}
