import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, untracked, viewChild } from '@angular/core';

import { ThemeService } from '../../services/theme.service';
import { VisualFrame, VisualizerService } from '../../services/visualizer.service';

/** Heights of the bars when they stand still: a "playing" icon */
const STILL = [0.55, 0.9, 0.7, 0.4];
const WIDTH = 16;
const HEIGHT = 14;

/**
 * Four bars next to the track playing: lows, low-mids, high-mids and highs of the actual sound.
 * They stand still when the visualizers do (reduced motion, turned off, paused), or when the
 * live equalizer is turned off in Appearance.
 */
@Component({
  selector: 'app-equalizer',
  template: `<canvas #canvas [width]="width" [height]="height" aria-hidden="true"></canvas>`,
  styles: [`
    :host {
      display: inline-block;
      width: 16px;
      height: 14px;
      line-height: 0;
      vertical-align: middle;
    }
    canvas {
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EqualizerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly visualizer = inject(VisualizerService);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  // Drawn at twice the size, for sharp bars on dense screens
  readonly width = WIDTH * 2;
  readonly height = HEIGHT * 2;
  private colour = '#4fd1c5';

  constructor() {
    effect(() => {
      this.theme.active();
      this.theme.accent();
      // The colour of the text around: the accent in a row playing
      this.colour = getComputedStyle(this.host.nativeElement).color || this.colour;
      if (!this.visualizer.running() || !this.theme.liveEqualizer()) {
        this.draw();
      }
    });
    afterNextRender(() => this.draw());
    // Moving only when chosen in Appearance: otherwise it does not keep the loop running
    let stop = () => {};
    effect(() => {
      const live = this.theme.liveEqualizer();
      untracked(() => {
        stop();
        stop = live ? this.visualizer.listen((frame) => this.draw(frame)) : () => {};
      });
    });
    inject(DestroyRef).onDestroy(() => stop());
  }

  private draw(frame?: VisualFrame) {
    const context = this.canvas()?.nativeElement.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, this.width, this.height);
    context.fillStyle = this.colour;
    const gap = 4;
    const barWidth = (this.width - gap * 3) / 4;
    for (let i = 0; i < 4; i++) {
      const level = frame ? Math.max(0.15, Math.min(1, frame.eq[i] * (0.6 + frame.intensity * 0.7))) : STILL[i];
      const barHeight = level * this.height;
      context.beginPath();
      context.roundRect(i * (barWidth + gap), this.height - barHeight, barWidth, barHeight, 2);
      context.fill();
    }
  }
}
