import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

import { User } from './index';

@Injectable()
export class UsersService {

  constructor(private http: HttpClient) { }


  get(): Observable<User[]> {
    return this.http.get(`/api/users/list`).map((page) => page)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }

}
