import { Injectable } from '@angular/core';

import { CollectionViewer, DataSource } from "@angular/cdk/collections";

import { Song, IAppState } from '../../../app-state';
import { Observable } from 'rxjs/Observable';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { forEach } from '@angular/router/src/utils/collection';

import { Store, select } from '@ngrx/store';
import {
    SetPlaylist
} from './playlist-state'

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

    constructor(private store: Store<IAppState>) {
        super();
    }

    init(data: Song[], current: Song) {
        this.current = current;

        let index = 0;
        this.tracks = data.map((track) => {
            index += 1;
            track.index = index;
            track.state = track.uid === current.uid ? "playing" : "none";
            return track;
        });
    }

    switch(fromPosition, toPosition) {
        if (!toPosition) {
            toPosition = this.tracks.length;
        }
        // console.log("moved index: " + fromPosition + " to " + toPosition);

        this.tracks.forEach((track) => {
            if (track.index > fromPosition && track.index <= toPosition) {
                track.index -= 1;
            } else if (track.index < fromPosition && fromPosition > toPosition && track.index >= toPosition) {
                track.index += 1;
            }
        })

        if (fromPosition > toPosition) {
            this.tracks[fromPosition - 1].index = toPosition;
        } else {
            this.tracks[toPosition - 1].index += 1;
            this.tracks[fromPosition - 1].index = toPosition - 1;
        }

        this.tracks.sort((a: any, b: any) => {
            if (a.index < b.index) {
                return -1;
            } else if (a.index > b.index) {
                return 1;
            } else {
                return 0;
            }
        });

        this.store.dispatch(new SetPlaylist(this.tracks));
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
                let searchStr = JSON.stringify(Object.values(item)).toLowerCase();
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