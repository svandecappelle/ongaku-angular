import { Component, OnInit, Input, ViewChild, ElementRef } from '@angular/core';
import { forEach } from '@angular/router/src/utils/collection';
import { VuMetterFactory, VuMetter } from './level-vumetter';

@Component({
  selector: 'app-level-meter',
  templateUrl: './level-meter.component.html',
  styleUrls: ['./level-meter.component.scss']
})
export class LevelMeterComponent implements OnInit {

  private processor: ScriptProcessorNode;
  private canvasContext;

  private clipping = false;
  private lastClip = 0;
  private volume = [0, 0];
  private clipLevel = 0.98;
  private averaging = 0.95;
  private clipLag = 750;

  private WIDTH = 170;
  private HEIGHT = 25;

  @ViewChild('meterLeft', { read: ElementRef }) meterLeft: ElementRef;
  @ViewChild('meterRight', { read: ElementRef }) meterRight: ElementRef;

  @Input()
  private audio;

  @Input()
  private gain;

  @Input()
  private audioContext;

  private vue: Array<VuMetter> = [];

  constructor() { }

  private temp = 0;

  volumeAudioProcess(event) {
    this.temp +=1;
    for (let channel = 0; channel < 2; channel++) {
      var buf = event.inputBuffer.getChannelData(channel);
      var bufLength = buf.length;
      var sum = 0;
      var x;

      // Do a root-mean-square on the samples: sum up the squares...
      for (var i = 0; i < bufLength; i++) {
        x = buf[i];
        if (Math.abs(x) >= this.clipLevel) {
          this.clipping = true;
          this.lastClip = window.performance.now();
        }
        sum += x * x;
      }

      // ... then take the square root of the sum.
      var rms = Math.sqrt(sum / bufLength);

      // Now smooth this out with the averaging factor applied
      // to the previous sample - take the max here because we
      // want "fast attack, slow release."
      this.volume[channel] = Math.max(rms, this.volume[channel] * this.averaging);
    }
    // console.log(this.volume);
  }

  ngOnInit() {
    this.vue.push(VuMetterFactory.get(this.meterLeft.nativeElement.getContext('2d'), 'LEFT'));
    this.vue.push(VuMetterFactory.get(this.meterRight.nativeElement.getContext('2d'), 'RIGHT'));

    if (this.audio) {
      //this.mediaStreamSource = this.audioContext.createMediaElementSource(this.audio.nativeElement);
      this.processor = this.audioContext.createScriptProcessor(512);
      this.processor.onaudioprocess = (event) => {
        this.volumeAudioProcess(event);
      };

      // this will have no effect, since we don't copy the input to the output,
      // but works around a current Chrome bug.
      this.processor.connect(this.audioContext.destination);

      // Create a new volume meter and connect it.
      this.audio.connect(this.processor);
      // kick off the visual updating

      this.drawLoop(0);
      this.drawLoop(1);
    }
  }

  checkClipping() {
    if (!this.clipping)
      return false;
    if ((this.lastClip + this.clipLag) < window.performance.now())
      this.clipping = false;
    return this.clipping;
  }

  getMetter(channel): VuMetter {
    return this.vue[channel];
  }

  drawLoop(channel) {
    this.canvasContext = this.getMetter(channel);
    //console.log(this.volume[channel] * 100);
    this.canvasContext.setValue(this.volume[channel] * 100 * this.gain);
    window.requestAnimationFrame(() => {
      this.drawLoop(channel);
    });
  }

}
