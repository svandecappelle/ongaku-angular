import { Component, ViewChild, ChangeDetectionStrategy, effect, inject } from '@angular/core';

import { PlaybackService } from '../../../services/playback.service';

import { FullscreenComponent } from './fullscreen/fullscreen.component';

@Component({
    selector: 'app-player-controls',
    templateUrl: './player-controls.component.html',
    styleUrls: ['./player-controls.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PlayerControlsComponent {

  // Playback lives in PlaybackService, so that it survives a switch to the new interface
  private readonly playback = inject(PlaybackService);

  color = 'accent';
  buffer = 'determinate' as const;

  @ViewChild('fullscreener', { read: FullscreenComponent, static: false }) fullscreener: FullscreenComponent;

  get state() { return this.playback.state(); }
  get current() { return this.playback.current(); }
  get currentTime() { return this.playback.currentTime(); }
  get duration() { return this.playback.duration(); }
  get value() { return this.playback.progress(); }
  get gain() { return this.playback.gain(); }
  get metadataLoaded() { return this.state !== 'loading'; }
  get isInit() { return this.playback.started(); }
  get sound() { return this.playback.source; }
  get context() { return this.playback.context; }

  constructor() {
    effect(() => {
      const current = this.playback.current();
      if (current && this.fullscreener) {
        this.fullscreener.setCurrent(current);
      }
    });
    effect(() => this.fullscreener?.setState(this.playback.state()));
    effect(() => this.fullscreener?.time(this.playback.progress(), this.playback.duration()));
  }

  volumeChanged(event) {
    this.playback.setGain(event.value);
  }

  isPlaying() {
    return this.playback.playing();
  }

  play() {
    this.playback.toggle();
  }

  previous() {
    this.playback.previous();
  }

  next() {
    this.playback.next();
  }

  onStepperClick($event) {
    this.goTo(this.duration * $event.clientX / $event.target.offsetWidth);
  }

  goTo(time) {
    this.playback.seek(time);
  }

  fullscreen() {
    this.fullscreener.setCurrent(this.current);
    this.fullscreener.open(this);
  }
}
