import { Injectable } from '@angular/core';

import { HttpClient, HttpParams, HttpRequest, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class UserService {

  constructor(private http: HttpClient) { }

  getMyInfos (): Observable<any> {
    return this.http.get(`/api/user/me`).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
  }

  getUserInfos (username): Observable<any> {
    return this.http.get(`/api/user/${username}`).map((data) => data)
      .catch((error: any) => Observable.throw(error || 'Server error'));
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
