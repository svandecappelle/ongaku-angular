import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';

import { ThemeService } from '../../services/theme.service';
import { VisualFrame, VisualizerService } from '../../services/visualizer.service';
import { formatTime } from '../format-time';

/** Bars that lift with the sound, on each side of the play head */
const LIFT_SPREAD = 6;
const STEP = 5;
const PAGE_STEP = 30;

/**
 * Seek bar drawn as the waveform of the track: the played part in the accent colour. A slider for
 * the keyboard and the screen readers; hover shows the time, a click or a drag seeks. When the
 * visualizers move, the bars at the play head lift a little with the low frequencies.
 */
@Component({
  selector: 'app-waveform-seek',
  template: `
    <canvas #canvas aria-hidden="true"></canvas>
    @if (tipRatio() !== null) {
      <span class="tip" [style.left.%]="tipRatio()! * 100">{{ formatTime(tipRatio()! * duration()) }}</span>
    }
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      height: 36px;
      cursor: pointer;
      touch-action: none;
      border-radius: 6px;
      outline: none;
    }
    :host(:focus-visible) {
      box-shadow: 0 0 0 2px var(--ongaku-accent);
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .tip {
      position: absolute;
      bottom: calc(100% + 6px);
      transform: translateX(-50%);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;
      color: var(--ongaku-text);
      background: var(--ongaku-surface-2);
      border: 1px solid var(--ongaku-border);
    }
  `],
  host: {
    role: 'slider',
    tabindex: '0',
    'aria-valuemin': '0',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuemax]': 'roundedDuration()',
    '[attr.aria-valuenow]': 'roundedPosition()',
    '[attr.aria-valuetext]': 'formatTime(shownPosition()) + " of " + formatTime(duration())',
    '(keydown)': 'onKey($event)',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'drag.set(null)',
    '(pointerleave)': 'hover.set(null)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaveformSeekComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly visualizer = inject(VisualizerService);
  // Not required: the effects may draw before the view exists
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  /** 400 values from 0 to 255 */
  readonly peaks = input.required<number[]>();
  /** Seconds */
  readonly position = input(0);
  readonly duration = input(0);
  readonly label = input('Position in the track');
  /** Seconds while dragging (null once released), to show the time elsewhere */
  readonly scrub = output<number | null>();
  readonly seek = output<number>();

  /** Positions as a share of the track, from 0 to 1 */
  readonly hover = signal<number | null>(null);
  readonly drag = signal<number | null>(null);
  readonly tipRatio = computed(() => this.drag() ?? this.hover());
  readonly shownPosition = computed(() => (this.drag() !== null ? this.drag()! * this.duration() : this.position()));
  readonly roundedDuration = computed(() => Math.round(this.duration() || 0));
  readonly roundedPosition = computed(() => Math.round(this.shownPosition() || 0));
  readonly formatTime = formatTime;

  private size = { width: 0, height: 0 };
  private colours = { played: '#4fd1c5', rest: '#9aa3b2' };

  constructor() {
    // Theme colours, read again when the theme changes
    effect(() => {
      this.theme.active();
      this.theme.accent();
      const style = getComputedStyle(this.host.nativeElement);
      this.colours = {
        played: style.getPropertyValue('--ongaku-accent').trim() || this.colours.played,
        rest: style.getPropertyValue('--ongaku-muted').trim() || this.colours.rest,
      };
      this.draw();
    });
    // Still drawing: on every change of what is shown
    effect(() => {
      this.peaks();
      this.shownPosition();
      this.hover();
      this.visualizer.motion();
      // Stopped (pause, hidden tab): the bars lifted by the last frame come down
      this.visualizer.running();
      this.draw();
    });
    // Moving: on every frame, while the visualizers run
    const stop = this.visualizer.listen((frame) => this.draw(frame));

    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.host.nativeElement);
      this.resize();
      this.destroy = () => observer.disconnect();
    });
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.destroy();
    });
  }

  private destroy = () => undefined;

  onKey(event: KeyboardEvent) {
    const steps: Record<string, number> = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP, PageUp: PAGE_STEP, PageDown: -PAGE_STEP };
    let target: number | null = null;
    if (event.key in steps) {
      target = this.position() + steps[event.key];
    } else if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = this.duration() - 1;
    }
    if (target !== null && this.duration()) {
      event.preventDefault();
      this.seek.emit(Math.min(Math.max(target, 0), this.duration()));
    }
  }

  onDown(event: PointerEvent) {
    if (!this.duration() || event.button !== 0) {
      return;
    }
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.drag.set(this.ratioAt(event));
    this.scrub.emit(this.drag()! * this.duration());
  }

  onMove(event: PointerEvent) {
    const ratio = this.ratioAt(event);
    if (this.drag() !== null) {
      this.drag.set(ratio);
      this.scrub.emit(ratio * this.duration());
    } else if (event.pointerType === 'mouse') {
      this.hover.set(ratio);
    }
  }

  onUp(event: PointerEvent) {
    const ratio = this.drag();
    if (ratio === null) {
      return;
    }
    this.host.nativeElement.releasePointerCapture(event.pointerId);
    this.drag.set(null);
    this.scrub.emit(null);
    this.seek.emit(ratio * this.duration());
  }

  private ratioAt(event: PointerEvent): number {
    const rect = this.host.nativeElement.getBoundingClientRect();
    return rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
  }

  private resize() {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) {
      return;
    }
    const rect = this.host.nativeElement.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.size = { width: rect.width, height: rect.height };
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  private draw(frame?: VisualFrame) {
    const canvas = this.canvas()?.nativeElement;
    const context = canvas?.getContext('2d');
    const { width, height } = this.size;
    if (!context || !width || !height) {
      return;
    }
    const peaks = this.peaks();
    context.clearRect(0, 0, width, height);
    // A bar every 3 pixels at least: the 400 values are grouped on narrow screens
    const count = Math.max(1, Math.min(peaks.length, Math.floor(width / 3)));
    const gap = width / count > 4 ? 2 : 1;
    const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
    const duration = this.duration();
    const played = duration ? this.shownPosition() / duration : 0;
    const head = Math.floor(played * count);
    const hover = this.hover();
    const hovered = hover !== null && this.drag() === null ? Math.floor(hover * count) : -1;
    const lift = frame ? frame.bass * frame.intensity * 0.45 : 0;
    for (let i = 0; i < count; i++) {
      const from = Math.floor((i * peaks.length) / count);
      const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
      let value = 0;
      for (let j = from; j < to; j++) {
        value = Math.max(value, peaks[j] ?? 0);
      }
      let level = value / 255;
      const distance = Math.abs(i - head);
      if (lift && distance < LIFT_SPREAD) {
        level = Math.min(1, level + lift * (1 - distance / LIFT_SPREAD));
      }
      const barHeight = Math.max(2, level * height);
      const isPlayed = i < head;
      context.fillStyle = isPlayed || i <= hovered ? this.colours.played : this.colours.rest;
      context.globalAlpha = isPlayed ? 1 : i <= hovered ? 0.5 : 0.35;
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;
      const radius = Math.min(barWidth / 2, 2);
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, radius);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}
