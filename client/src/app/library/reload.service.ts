
import {throwError as observableThrowError,  Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';

@Injectable()
export class ReloadService {

  constructor(private http: HttpClient) { }


  reload (): Observable<any> {
    return this.http.post(`/api/admin/library/reload`, {});
  }
}
