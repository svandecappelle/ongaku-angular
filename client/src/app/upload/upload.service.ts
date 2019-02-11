
import { Subject, Observable, throwError as observableThrowError, } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient, HttpRequest, HttpEventType, HttpResponse, HttpHeaders } from '@angular/common/http';

const url = '/api/audio/upload';

@Injectable()
export class UploadService {
  constructor(private http: HttpClient) { }

  public list(folder: string): Observable<any> {
    return this.http.get(`/api/audio/my-library/${folder}`);
  }

  public upload(folder: string, files: Set<File>): { [key: string]: Observable<number> } {

    // this will be the our resulting map
    const status = {};

    files.forEach(file => {
      // create a new multipart-form for every file
      const formData: FormData = new FormData();
      formData.append('file', file, file.name);

      // create a http-post request and pass the form
      // tell it to report the upload progress
      const req = new HttpRequest('POST', folder ? url.concat(`/${folder}`): url, formData, {
        reportProgress: true
      });

      // create a new progress-subject for every file
      const progress = new Subject<number>();

      // send the http-request and subscribe for progress-updates
      this.http.request(req).subscribe(event => {
        if (event.type === HttpEventType.UploadProgress) {

          // calculate the progress percentage
          const percentDone = Math.round(100 * event.loaded / event.total);

          // pass the percentage into the progress-stream
          progress.next(percentDone);
        } else if (event instanceof HttpResponse) {

          // Close the progress-stream if we get an answer form the API
          // The upload is complete
          progress.complete();
        }
      });

      // Save every progress-observable in a map of all observables
      status[file.name] = {
        progress: progress.asObservable()
      };
    });

    // return the map of progress.observables
    return status;
  }

  createFolder(folderName: string, location: any): Observable<any>  {
    return this.http.post<any>('/api/audio/my-library/create-folder', {
      'folder': folderName,
      'location': location
    });
  }
}