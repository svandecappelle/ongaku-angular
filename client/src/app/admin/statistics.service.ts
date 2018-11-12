
import {throwError as observableThrowError,  Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable()
export class StatisticsService {

  constructor(private http: HttpClient) { }

  getDetails(): Observable<any> {
    return this.http.get(`/api/install`);
  }

  getUsersAccess(): Observable<any> {
    return this.http.get(`/api/admin/statistics/users/login`);
  }

  getUsersActivity(): Observable<any> {
    return this.http.get(`/api/admin/statistics/users/activity`);
  }
  
  getStatistics(): Observable<any> {
    return this.http.get(`/api/admin/statistics`);
  }
}
