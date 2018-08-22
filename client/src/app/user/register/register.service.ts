import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class RegisterService {

  constructor(private http: HttpClient) { }

  fetchRegisterParameters(): Observable<any> {
    return this.http.get(`/api/auth/register`).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }

  register(email, username, password, confirmPassword) : Observable<any> {
    return this.http.post(`/api/auth/register`, {
      email: email,
      username: username,
      password: password,
      confirmPassword: confirmPassword
    }).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }
}
