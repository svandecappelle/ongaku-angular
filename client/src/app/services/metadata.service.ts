import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class MetadataService {

    constructor(private http: HttpClient){ 
    }

    set(uids: Array<string>, metadatas: any): Observable<boolean> {
        return this.http.put('/api/audio/metadata/selection/set/', {
            ids: uids,
            metadatas: metadatas
        }).pipe(map(r => true));
    }
}