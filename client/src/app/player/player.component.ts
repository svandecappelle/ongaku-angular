import { Component, OnInit, OnDestroy } from '@angular/core';
import { AudioService } from './player.service';
import { Song, IAppState } from '../app-state';

import { Store, select } from '@ngrx/store';

import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.scss']
})
export class PlayerComponent implements OnInit, OnDestroy {

    // General variables
    private song: Song;
    private currentTime: string;
    private fullTime: string;
    private isPlaying: boolean;
    // Subscription variables
    private songSubscription: any;
    private currentTimeSubscription: any;
    private fullTimeSubscription: any;

    private color = "accent";

    private tracklist = Observable;
  
    constructor(private _playerService: AudioService, private store: Store<IAppState>) {
      /*this.store.select(state => state.trackList).subscribe((val) => {
        console.log("tracklist changed");
        console.log(val);
      });*/
    }
  
    ngOnInit() {
      this.songSubscription = this._playerService.song.subscribe(data => this.song = data);
      this.currentTimeSubscription = this._playerService.currentTime.subscribe(data => this.currentTime = data);
      this.fullTimeSubscription = this._playerService.fullTime.subscribe(data => this.fullTime = data);
      console.log("Player subscription initialized");
    }
  
    toggleAudio() {
      this.isPlaying = this._playerService.toggleAudio();
    }
  
    ngOnDestroy() {
      this.songSubscription.unsubscribe();
      this.currentTimeSubscription.unsubscribe();
      this.fullTimeSubscription.unsubscribe();
      console.log("Player subscription destroyed");
    }

}
