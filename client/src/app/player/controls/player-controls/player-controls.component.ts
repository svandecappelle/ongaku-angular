import { Component, OnInit, ViewChild, ElementRef, Renderer } from '@angular/core';
import { Store, select } from '@ngrx/store';

import { Song, IAppState } from '../../../app-state';

@Component({
  selector: 'app-player-controls',
  templateUrl: './player-controls.component.html',
  styleUrls: ['./player-controls.component.scss']
})
export class PlayerControlsComponent implements OnInit {

  private color = "accent";

  private duration;
  private currentTime;
  private value;

  private state = 'stopped';
  private src;
  private play_index: number = 0;
  private tracks: Object[] = [];

  @ViewChild('audio', { read: ElementRef }) player:ElementRef;
  @ViewChild('progress', { read: ElementRef }) progressBar:ElementRef;

  constructor(public renderer: Renderer, private store: Store<IAppState>) { }

  ngOnInit () {
    this.player.nativeElement.addEventListener('loadedmetadata', (el) => {
      this.duration = el.target.duration;
      this.value = 0;
      if (this.state === 'stopped') {
        this.play();
      }
    });

    this.player.nativeElement.addEventListener('timeupdate', (el) => {
      this.currentTime = el.target.currentTime;
      this.value = this.currentTime / this.duration * 100;
    });

    this.player.nativeElement.addEventListener('endded', (el) => {
      this.next();
    });

    this.store.select(state => state.trackList).subscribe((val) => {
      this.tracks = val;
      this.ensurePlay();
    });
  }

  ensurePlay(){
    if (!this.src && this.tracks.length > 0){
      console.log(this.tracks[this.play_index]);
      this.src = this.link(this.tracks[this.play_index]['uid']);
    }
  }

  play () {
    if (this.state !== 'playing') {
      this.state = 'playing';
      this.player.nativeElement.play();
    } else {
      this.state = 'paused';
      this.player.nativeElement.pause();      
    }
  }

  stop () {
    this.state = 'stopped';
    this.player.nativeElement.pause();
  }

  previous () {
    this.stop();
    if (this.play_index > 0) {
      this.play_index -= 1;
      this.src = this.link(this.tracks[this.play_index]['uid']);
    }
  }

  next () {
    this.stop();
    if (this.tracks.length > this.play_index +1) {
      this.play_index += 1;
      this.src = this.link(this.tracks[this.play_index]['uid']);
    }
  }

  change (uid) {
    this.stop();
    this.src = this.link(uid);
  }

  link (uid) {
    return `/api/audio/stream/${uid}`;
  }

  onStepperClick ($event) {
    this.currentTime = this.duration * $event.layerX / this.progressBar.nativeElement.clientWidth;
    this.player.nativeElement.currentTime = this.currentTime;
  }
}
