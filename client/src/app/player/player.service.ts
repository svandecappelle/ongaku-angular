



import { Action } from '@ngrx/store';
import { Observable ,  Subject } from 'rxjs';
import { AudioSource } from './audio-source';
import { Song } from '../app-state';
import { Injectable } from "@angular/core";

class UtilityService {
  
}


@Injectable()
export class AudioService {
  events$: Observable<Action>;

  private audio: any;
  public song: Subject<Song> = new Subject<Song>();
  public currentTime: Subject<string> = new Subject<string>();
  public fullTime: Subject<string> = new Subject<string>();


  constructor(/*private _utilityService: UtilityService*/) {
    this.audio = new Audio();
  }

  setPlayer(song: Song) {
    this.song.next(song);
    this.audio.src = song.uid;
    this.audio.oncanplaythrough = () => {
      this.audio.play();
      /*this.fullTime.next(
        this._utilityService.getFormatedTime(this.audio.duration)
      );*/
    };
    this.audio.ontimeupdate = () => {
     /* this.currentTime.next(
        this._utilityService.getFormatedTime(this.audio.currentTime)
      );*/
    };
  }

  toggleAudio() {
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }

    return this.audio.paused;
  }

}
