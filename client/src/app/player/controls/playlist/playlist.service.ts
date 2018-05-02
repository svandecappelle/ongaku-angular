import { Injectable } from '@angular/core';

import { CollectionViewer, DataSource } from "@angular/cdk/collections";

import { Song } from '../../../app-state';
import { Observable } from 'rxjs/Observable';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

@Injectable()
export class PlaylistService extends DataSource<Song> {
    private tracksSubject = new BehaviorSubject<Song[]>([]);
    private tracks: Song[];
    private current: Song;

    _filterChange = new BehaviorSubject('');
    filteredData: Song[] = [];
    renderedData: Song[] = [];


    get filter(): string { return this._filterChange.value; }
    set filter(filter: string) { this._filterChange.next(filter); }

    constructor () {
        super();
    }

    init(data: Song[], current: Song){
        this.current = current;

        let index = 0;
        this.tracks = data.map((track) => {
            index += 1;
            track.index = index;
            track.state = track.uid === current.uid ? "playing" : "none";
            return track;
        });
    }

    playing(current: Song) {
        this.current = current;
        this.renderedData.forEach(track => {
            track.state = track.uid === current.uid ? "playing" : "none";
        });
    }

    connect(collectionViewer: CollectionViewer): Observable<Song[]> {
        //return this.tracksSubject.asObservable();
        const displayDataChanges = [
            this.tracks,
            this._filterChange
          ];

        return Observable.merge(...displayDataChanges).map(() => {
            // Filter data
            this.filteredData = this.tracks.slice().filter((item: Song) => {
              let searchStr = (item.title).toLowerCase();
              return searchStr.indexOf(this.filter.toLowerCase()) != -1;
            });
      
            // Grab the page's slice of the filtered sorted data.
            this.renderedData = this.filteredData;
            return this.renderedData;
          });
    }

    disconnect(collectionViewer: CollectionViewer): void {
        // this.tracksSubject.complete();
    }
}