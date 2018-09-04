import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class AdminService {

  constructor(private http: HttpClient) { }

  getProperties(): Observable<any> {
    return this.http.get(`/api/admin/configure`).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }

  configure(opts): Observable<any> {
    return this.http.post(`/api/admin/configure`, opts).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }

  update(): Observable<any> {
    return this.http.post('/api/upgrade/git/check', {}).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }
}
