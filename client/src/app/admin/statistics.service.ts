import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class StatisticsService {

  constructor(private http: HttpClient) { }

  getUsersAccess (): Observable<any> {
    return this.http.get(`/api/admin/statistics/users/login`).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }

  getUsersActivity (): Observable<any> {
    return this.http.get(`/api/admin/statistics/users/activity`).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }
}
