import { Component, OnInit, OnDestroy } from '@angular/core';
import { AudioService } from './player.service';

import { Song } from '../app-state';
import { Subject } from 'rxjs/Subject';

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
    
  
    constructor(private _playerService: AudioService) {
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
