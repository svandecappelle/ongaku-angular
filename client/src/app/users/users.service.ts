
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';

import { User } from './index';

@Injectable()
export class UsersService {

  constructor(private http: HttpClient) { }


  get(): Observable<User[]> {
    return this.http.get(`/api/users/list`).pipe(map((page: User[]) => page));
  }

}
