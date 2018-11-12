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
import { Subscription } from 'rxjs';

@Component({
    selector: 'playlist-dialog',
    templateUrl: 'playlist-dialog.html',
    styleUrls: ['./playlist-dialog.component.scss']
})
export class PlaylistDialogComponent implements OnDestroy {

    public current: Song;
    private store: Store<IAppState>;
    private subscriptions;
    private dataSource: PlaylistService;

    @ViewChild('filter') filter: ElementRef;

    private displayedColumns = ['action', 'index', 'title', 'artist', 'album', 'duration'];

    constructor(@Inject(MAT_DIALOG_DATA) public data: any, private actions: PlayerActions, private dragulaService: DragulaService) {
        this.store = this.data.store;
        this.subscriptions = new Subscription();

        this.dataSource = new PlaylistService(this.store);
        this.dataSource.init(this.data.tracklist, this.data.current);

        this.subscriptions.add(this.store.select(state => state.player).subscribe((val) => {
            this.current = val.track;
            this.dataSource.playing(this.current);
        }));

        const bag: any = this.dragulaService.find('playlist-bag'); if (bag !== undefined) { this.dragulaService.destroy('playlist-bag'); };

        dragulaService.createGroup('playlist-bag', {
            moves: (el, container, handle) => {
                return handle.className.match('.*handle.*') !== null;
            }
        });

        this.subscriptions.add(dragulaService.drop('playlist-bag').subscribe((value: any) => {
            this.onDrop(value);
        }));
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
        this.dataSource.switch(parseInt(args.el.id), (args.sibling ? parseInt(args.sibling.id) - 1 : null));
        // TODO fire change event on tracklist to set tracklist in appstate
        this.addClass(args.el, 'ex-moved');
    }

    applyFilter(filterValue: string) {
        filterValue = filterValue.trim(); // Remove whitespace
        filterValue = filterValue.toLowerCase();
        this.dataSource.filter = filterValue;
    }

    play(track) {
        this.current = track;
        this.store.dispatch(this.actions.playSelectedTrack(this.current));
    }

    pause(track) {
        this.current = track;
        this.store.dispatch(this.actions.audioPaused());
    }

    ngOnDestroy() {
        this.dragulaService.destroy("playlist-bag");
        this.subscriptions.unsubscribe();
    }
}
