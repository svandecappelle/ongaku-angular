import { Component, OnInit, ViewChild, ElementRef, Renderer, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { BehaviorSubject, Subscription } from 'rxjs';

import { PlayerStateRecord, IPlayerState } from '../../index';

import { Song, IAppState } from '../../../app-state';
import { PlayerAction, PlayerActions } from '../../player-actions';

import { FullscreenComponent } from './fullscreen/fullscreen.component';

@Component({
  selector: 'app-player-controls',
  templateUrl: './player-controls.component.html',
  styleUrls: ['./player-controls.component.scss']
})
export class PlayerControlsComponent implements OnInit, OnDestroy {

  private subscriptions: Subscription = new Subscription();
  private color = 'accent';

  private duration;
  private currentTime;
  private value;

  private state = 'stopped';
  private current;
  private metadataLoaded: Boolean = true;

  private isInit: Boolean;
  private src;
  private play_index = 0;
  private tracks: Object[] = [];

  private context: AudioContext = new AudioContext();
  private sound;
  // private gainNode;

  @ViewChild('audio', { read: ElementRef }) player: ElementRef;
  @ViewChild('progress', { read: ElementRef }) progressBar: ElementRef;

  @ViewChild('fullscreener', { read: FullscreenComponent }) fullscreener: FullscreenComponent;

  constructor(public renderer: Renderer, private store: Store<IAppState>, private actions: PlayerActions) {
    this.isInit = false;
  }

  ngOnInit() {
    this.player.nativeElement.addEventListener('loadedmetadata', (el) => {
      this.metadataLoaded = true;
      this.duration = el.target.duration;
      this.value = 0;
    });

    this.player.nativeElement.addEventListener('timeupdate', (el) => {
      this.currentTime = el.target.currentTime;
      this.value = this.currentTime / this.duration * 100;

      this.fullscreener.time(this.value, this.duration);
    });

    this.player.nativeElement.addEventListener('ended', (el) => {
      this.next();
    });
    
    this.context = new AudioContext();
    //
    // control gain / volume
    // this.gainNode = this.context.createGain();
    // this.gainNode.gain.value = 0.75; // 0.75% volume to ensure not gain
    // this.gainNode.connect(this.context.destination);*/
    this.sound = this.context.createMediaElementSource(this.player.nativeElement);
    this.sound.connect(this.context.destination);

    this.player.nativeElement.addEventListener('canplay', (el) => {
      // connect the gain node to an output destination  
      if (this.state !== 'playing') {
        this.play();
      }
    });

    this.subscriptions.add(this.store.select(state => state.player).subscribe((playerState) => {
      let track = playerState.track;
      if (track) {
        this.play_index = track.index;
        this.current = track;
        if (this.fullscreener) {
          this.fullscreener.setCurrent(this.current);
        }
        this.stop();
        this.change(this.current.uid);
      }
    }));

    this.subscriptions.add(this.store.select(state => state.trackList).subscribe((val) => {
      this.tracks = val;
      if (this.play_index === 0) {
        this.current = val[0];

        if (this.fullscreener) {
          this.fullscreener.setCurrent(this.current);
        }
        this.ensurePlay();
      }
    }));
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  ensurePlay() {
    if (!this.src && this.tracks.length > 0) {
      this.src = this.link(this.tracks[this.play_index]['uid']);
    }
  }

  isPlaying() {
    return !this.player.nativeElement.paused;
  }

  play() {
    if (this.state !== 'playing') {
      if (this.tracks[this.play_index] === 'stopped') {
        this.state = 'playing';

        this.current = this.tracks[this.play_index];

        if (this.fullscreener) {
          this.fullscreener.setCurrent(this.current);
        }
        this.store.dispatch(this.actions.playSelectedTrack(this.current));

        if (!this.isPlaying()) {
          this.player.nativeElement.play();
        }
      } else {
        this.state = 'playing';
        if (!this.isPlaying()) {
          this.player.nativeElement.play();
        }
      }
    } else {
      this.state = 'paused';
      this.player.nativeElement.pause();
    }

    this.fullscreener.setState(this.state);
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
      if (this.fullscreener) {
        this.fullscreener.setCurrent(this.current);
      }
      this.store.dispatch(this.actions.playSelectedTrack(this.current));
    }
  }

  next() {
    this.switching();
    const newIndex = this.current ? this.current.index + 1 : this.play_index + 1;
    if (this.tracks.length > newIndex) {
      this.play_index = newIndex;
      this.current = this.tracks[newIndex];
      if (this.fullscreener) {
        this.fullscreener.setCurrent(this.current);
      }
      this.store.dispatch(this.actions.playSelectedTrack(this.current));
    } else {
      this.currentTime = 0;
      this.player.nativeElement.currentTime = this.currentTime;
      this.state = 'paused';
    }
  }

  change(uid) {
    this.metadataLoaded = false;
    this.switching();
    this.src = this.link(uid);
  }

  link(uid) {
    this.isInit = true;
    return `/api/audio/stream/${uid}`;
  }

  isInitialized() {
    return this.isInit;
  }

  onStepperClick($event) {
    this.currentTime = this.duration * $event.clientX / $event.target.offsetWidth;
    this.player.nativeElement.currentTime = this.currentTime;
  }

  goTo(time) {
    this.currentTime = time;
    this.player.nativeElement.currentTime = this.currentTime;
  }

  fullscreen() {
    if (this.fullscreener) {
      this.fullscreener.setCurrent(this.current);
    }
    this.fullscreener.open(this);
  }
}
