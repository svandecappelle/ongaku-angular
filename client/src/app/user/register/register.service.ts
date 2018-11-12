
import {throwError as observableThrowError,  Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';

@Injectable()
export class RegisterService {

  constructor(private http: HttpClient) { }

  fetchRegisterParameters(): Observable<any> {
    return this.http.get(`/api/auth/register`);
  }

  register(email, username, password, confirmPassword) : Observable<any> {
    return this.http.post(`/api/auth/register`, {
      email: email,
      username: username,
      password: password,
      confirmPassword: confirmPassword
    });
  }
}
