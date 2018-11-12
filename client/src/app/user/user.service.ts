
import {throwError as observableThrowError,  Observable } from 'rxjs';
import { Injectable } from '@angular/core';

import { HttpClient, HttpParams, HttpRequest, HttpEvent } from '@angular/common/http';

@Injectable()
export class UserService {

  constructor(private http: HttpClient) { }

  getMyInfos (): Observable<any> {
    return this.http.get(`/api/user/me`);
  }

  getUserInfos (username): Observable<any> {
    return this.http.get(`/api/user/${username}`);
  }

  // file from event.target.files[0]
  uploadFile(url: string, file: File): Observable<HttpEvent<any>> {

    let formData = new FormData();
    formData.append('upload', file);

    let params = new HttpParams();

    const options = {
      params: params,
      reportProgress: true,
    };

    const req = new HttpRequest('POST', url, formData, options);
    return this.http.request(req);
  }
}
