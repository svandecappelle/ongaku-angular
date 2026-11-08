import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { VisualFrame } from '../../services/visualizer.service';
import { PlayerVisual, rgba } from './player-visual';

/** Bars of the still waveform */
const STILL_BARS = 80;

/**
 * Frequency bars spaced as the ear hears them, with their reflection. Still (reduced motion,
 * paused), the waveform of the track with the played part in the accent; nothing without one.
 */
@Component({
  selector: 'app-spectrum',
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: [`
    :host {
      display: block;
      height: 72px;
      pointer-events: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpectrumComponent extends PlayerVisual {
  /** Waveform of the track (400 values from 0 to 255), for the still version */
  readonly peaks = input<number[] | null>(null);

  protected override watch() {
    this.peaks();
    // The played part grows: about once a second (currentTime changes at that pace)
    this.playback.currentTime();
  }

  protected draw(context: CanvasRenderingContext2D, frame: VisualFrame | undefined) {
    // The bars stand on a line at 3/4 of the height; the reflection goes below
    const base = Math.round(this.height * 0.75);
    if (frame) {
      this.drawBands(context, frame, base);
    } else {
      this.drawWaveform(context, base);
    }
  }

  private drawBands(context: CanvasRenderingContext2D, frame: VisualFrame, base: number) {
    const { width, colours } = this;
    const count = frame.bands.length;
    const gap = width / count > 6 ? 3 : 2;
    const barWidth = (width - gap * (count - 1)) / count;
    const radius = Math.min(3, barWidth / 2);
    for (let i = 0; i < count; i++) {
      const level = Math.min(1, Math.pow(frame.bands[i], 1.3) * (0.7 + frame.intensity * 0.6));
      const barHeight = Math.max(2, level * base);
      const x = i * (barWidth + gap);
      const gradient = context.createLinearGradient(0, base - barHeight, 0, base);
      gradient.addColorStop(0, rgba(colours.accent, 0.4));
      gradient.addColorStop(1, colours.accent);
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(x, base - barHeight, barWidth, barHeight, radius);
      context.fill();
      context.fillStyle = rgba(colours.accent, 0.12);
      context.beginPath();
      context.roundRect(x, base + 3, barWidth, Math.min(this.height - base - 3, barHeight * 0.35), radius);
      context.fill();
    }
  }

  private drawWaveform(context: CanvasRenderingContext2D, base: number) {
    const peaks = this.peaks();
    if (!peaks?.length) {
      return;
    }
    const { width, colours } = this;
    const duration = this.playback.duration();
    const head = duration ? Math.floor((this.playback.currentTime() / duration) * STILL_BARS) : 0;
    const gap = 3;
    const barWidth = (width - gap * (STILL_BARS - 1)) / STILL_BARS;
    for (let i = 0; i < STILL_BARS; i++) {
      const from = Math.floor((i * peaks.length) / STILL_BARS);
      const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / STILL_BARS));
      let value = 0;
      for (let j = from; j < to; j++) {
        value = Math.max(value, peaks[j] ?? 0);
      }
      const barHeight = Math.max(2, (value / 255) * base * 0.8);
      context.fillStyle = i < head ? colours.accent : rgba(colours.muted, 0.35);
      context.beginPath();
      context.roundRect(i * (barWidth + gap), base - barHeight, barWidth, barHeight, Math.min(3, barWidth / 2));
      context.fill();
    }
  }
}
