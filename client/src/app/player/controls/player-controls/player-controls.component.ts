import { Component, OnInit, ViewChild, ElementRef, Renderer } from '@angular/core';

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

  private state = 'paused';
  private src = '/api/audio/stream/c0e63ef59267c94771ee8990540a8d47c61b3b2a';

  @ViewChild('audio', { read: ElementRef }) player:ElementRef;

  constructor(public renderer: Renderer) { }

  ngOnInit () {
    this.player.nativeElement.addEventListener('loadedmetadata', (el) => {
      console.log("can play", el.target.duration);
      this.duration = el.target.duration;
      this.value = 0;
      if (this.state === 'stopped') {
        console.log('launch plays');
        this.play();
      }
    });

    this.player.nativeElement.addEventListener('timeupdate', (el) => {
      // console.log("playing", el.target.currentTime);
      this.currentTime = el.target.currentTime;
      this.value = this.currentTime / this.duration * 100;
    });
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
    this.src = this.link('75f929160328f25a1c1d689b2e8706c491ad5cc9');
  }

  next () {
    this.stop();
    this.src = this.link('041a16d7608b67cc22eaaac675c74698740fe587');
  }

  change (uid) {
    this.stop();
    this.src = this.link(uid);
  }

  link (uid) {
    return `/api/audio/stream/${uid}`;
  }
}
