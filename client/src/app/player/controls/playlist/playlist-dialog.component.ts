import {
    Component,
    OnInit,
    Inject,
    OnDestroy,
    ViewChild,
    ElementRef
} from '@angular/core';
import { Store, select } from '@ngrx/store';
import { MAT_DIALOG_DATA } from '@angular/material';

import { DragulaService } from 'ng2-dragula';

import { Song, IAppState } from '../../../app-state';
import { PlayerActions } from '../../player-actions';
import { PlaylistService } from './playlist.service';

@Component({
    selector: 'playlist-dialog',
    templateUrl: 'playlist-dialog.html',
    styleUrls: ['./playlist-dialog.component.scss']
})
export class PlaylistDialogComponent implements OnDestroy {

    public current: Song;
    private store: Store<IAppState>;
    private subscription;
    private dataSource: PlaylistService;

    @ViewChild('filter') filter: ElementRef;

    private displayedColumns = ['action', 'index', 'title', 'artist', 'album', 'duration'];

    constructor(@Inject(MAT_DIALOG_DATA) public data: any, private actions: PlayerActions, private dragulaService: DragulaService) {
        this.store = this.data.store;

        this.dataSource = new PlaylistService(this.store);
        console.log(this.data);
        this.dataSource.init(this.data.tracklist, this.data.current);

        this.store.select(state => state.player).subscribe((val) => {
            this.current = val.track;
            this.dataSource.playing(this.current);
        });

        const bag: any = this.dragulaService.find('playlist-bag'); if (bag !== undefined) { this.dragulaService.destroy('playlist-bag'); };

        dragulaService.setOptions('playlist-bag', {
            moves: function (el, container, handle) {
                console.log(handle);
                return handle.className.match('.*handle.*');
            }
        });

        dragulaService.drop.subscribe((value: any) => {
            // console.log(`drop: ${value[0]}`);
            this.onDrop(value.slice(1));
        });
    }

    private hasClass(el: any, name: string): any {
        return new RegExp('(?:^|\\s+)' + name + '(?:\\s+|$)').test(el.className);
    }

    private addClass(el: any, name: string): void {
        if (!this.hasClass(el, name)) {
            el.className = el.className ? [el.className, name].join(' ') : name;
        }
    }

    private removeClass(el: any, name: string): void {
        if (this.hasClass(el, name)) {
            el.className = el.className.replace(new RegExp('(?:^|\\s+)' + name + '(?:\\s+|$)', 'g'), '');
        }
    }

    private onDrag(args: any): void {
        let [e] = args;
        this.removeClass(e, 'ex-moved');
    }

    private onDrop(args: any): void {
        let [e] = args;
        // console.log("moved index: " + args[0].id + " to " + (args[3] ? args[3].id.toString() : 'last'));
        this.dataSource.switch(parseInt(args[0].id), (args[3] ? parseInt(args[3].id) - 1 : null));
        // TODO fire change event on tracklist to set tracklist in appstate
        this.addClass(e, 'ex-moved');
    }

    applyFilter(filterValue: string) {
        filterValue = filterValue.trim(); // Remove whitespace
        filterValue = filterValue.toLowerCase();
        this.dataSource.filter = filterValue;
    }

    play(track) {
        this.current = track;
        this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(this.current));
    }

    pause(track) {
        this.current = track;
        this.store.select(state => state.player).dispatch(this.actions.audioPaused());
    }

    ngOnDestroy() {
        this.dragulaService.destroy("playlist-bag");
    }
}
