import { Component, OnInit, ViewChild, ElementRef, Renderer, ChangeDetectorRef } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

import { PlayerStateRecord, IPlayerState } from '../../index';

import { Song, IAppState } from '../../../app-state';
import { PlayerAction, PlayerActions } from '../../player-actions';

@Component({
  selector: 'app-player-controls',
  templateUrl: './player-controls.component.html',
  styleUrls: ['./player-controls.component.scss']
})
export class PlayerControlsComponent implements OnInit {

  private color = 'accent';

  private duration;
  private currentTime;
  private value;

  private state = 'stopped';
  private current;
  private metadataLoaded:boolean = true;

  private isInit: BehaviorSubject<boolean>;
  private src;
  private play_index = 0;
  private tracks: Object[] = [];

  @ViewChild('audio', { read: ElementRef }) player: ElementRef;
  @ViewChild('progress', { read: ElementRef }) progressBar: ElementRef;

  constructor(private ref: ChangeDetectorRef, public renderer: Renderer, private store: Store<IAppState>, private actions: PlayerActions) {
    this.isInit = new BehaviorSubject(false);
  }

  ngOnInit() {
    this.player.nativeElement.addEventListener('loadedmetadata', (el) => {
      this.metadataLoaded = true;
      this.ref.markForCheck();
      this.ref.detectChanges();
      this.duration = el.target.duration;
      this.value = 0;
      if (this.state !== 'playing') {
        this.play();
      }
    });

    this.player.nativeElement.addEventListener('timeupdate', (el) => {
      this.currentTime = el.target.currentTime;
      this.value = this.currentTime / this.duration * 100;
    });

    this.player.nativeElement.addEventListener('ended', (el) => {
      this.next();
    });

    this.store.select(state => state.player).subscribe((val) => {
      
      if (val.track) {

        this.play_index = val.track.index;

        this.current = val.track;
        this.stop();
        this.change(this.current.uid);
      }
    });

    this.store.select(state => state.trackList).subscribe((val) => {
      this.tracks = val;
      if (this.play_index === 0) {
        this.ensurePlay();
      }
    });
  }

  ensurePlay() {
    if (!this.src && this.tracks.length > 0) {
      this.src = this.link(this.tracks[this.play_index]['uid']);
    }
  }

  play() {
    if (this.state !== 'playing') {  
      if (this.tracks[this.play_index] === 'stopped') {
        this.state = 'playing';

        this.current = this.tracks[this.play_index];
        this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(this.current));

        this.player.nativeElement.play();
      } else {
        this.state = 'playing';
        this.player.nativeElement.play();
      }
    } else {
      this.state = 'paused';
      this.player.nativeElement.pause();
    }

    console.log(this.current);
  }

  stop() {
    this.state = 'stopped';
    this.player.nativeElement.pause();
  }

  switching() {
    this.state = 'loading';
    this.player.nativeElement.pause();
  }

  previous() {
    this.switching();
    if (this.play_index > 0) {
      this.play_index -= 1;
      this.current = this.tracks[this.play_index];
      this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(this.current));
    }
  }

  next() {
    this.switching();
    const newIndex =  this.current ? this.current.index + 1: this.play_index + 1;
    if (this.tracks.length > newIndex) {
      this.play_index = newIndex;
      this.current = this.tracks[newIndex];
      this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(this.current));
    }
  }

  change(uid) {
    this.metadataLoaded = false;
    this.ref.markForCheck();
    this.ref.detectChanges();
    this.switching();
    this.src = this.link(uid);
  }

  link(uid) {
    this.isInit.next(true);
    return `/api/audio/stream/${uid}`;
  }

  isInitialized() {
    return this.isInit.asObservable();
  }

  onStepperClick($event) {
    this.currentTime = this.duration * ($event.clientX - 72) / $event.target.offsetWidth;
    this.player.nativeElement.currentTime = this.currentTime;
  }
}
