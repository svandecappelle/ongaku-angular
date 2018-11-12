
import { throwError as observableThrowError, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';

@Injectable()
export class AdminService {

  constructor(private http: HttpClient) { }

  getProperties(): Observable<any> {
    return this.http.get(`/api/admin/configure`).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }

  configure(opts): Observable<any> {
    return this.http.post(`/api/admin/configure`, opts).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }

  update(): Observable<any> {
    return this.http.post('/api/upgrade/git/check', {}).pipe(map((data) => data))
      .pipe(catchError((error: any) => observableThrowError(error || 'Server error')));
  }
}
