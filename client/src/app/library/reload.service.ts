import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class ReloadService {

  constructor(private http: HttpClient) { }


  reload (): Observable<any> {
    return this.http.post(`/api/admin/library/reload`, {}).map((page) => page)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }
}
