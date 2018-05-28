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

        this.tracks = data.map((track) => {
            track.state = track.uid === current.uid ? 'playing' : 'none';
            return track;
        });
    }

    reorderArray(event, originalArray) {
        const movedItem = originalArray.find((item, index) => index === event.oldIndex);
        const remainingItems = originalArray.filter((item, index) => index !== event.oldIndex);

        const reorderedItems = [
            ...remainingItems.slice(0, event.newIndex),
            movedItem,
            ...remainingItems.slice(event.newIndex)
        ];

        return reorderedItems;
    }

    switch(fromPosition, toPosition) {
        if ( toPosition === null ) {
            toPosition = this.tracks.length - 1;
        }

        if ( toPosition < 0 ) {
            toPosition = 0;
        }

        // console.log("moved index: " + fromPosition + " to " + toPosition);

        let from = this.tracks[fromPosition];
        let to = this.tracks[toPosition];

        this.tracks = this.reorderArray({
            oldIndex: fromPosition,
            newIndex: toPosition
        }, this.tracks);

        // console.log(this.tracks);

        let index = 0;
        this.tracks.forEach((track) => {
           track.index = index;
           index += 1;
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