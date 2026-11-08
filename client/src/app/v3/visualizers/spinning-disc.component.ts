import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { VisualFrame } from '../../services/visualizer.service';
import { PlayerVisual, rgba } from './player-visual';

/** One turn every 8 seconds */
const TURN_SPEED = (Math.PI * 2) / 8;

/**
 * The cover as a record that turns while the music plays, in a ring of frequency ticks. Still
 * (reduced motion, paused, visualizers off), the disc stands and the ring shows the progress.
 */
@Component({
  selector: 'app-spinning-disc',
  imports: [MatIconModule],
  template: `
    <canvas #canvas aria-hidden="true"></canvas>
    <span class="disc" #disc>
      <mat-icon aria-hidden="true">album</mat-icon>
      @if (!broken()) {
        <img [src]="src()" alt="" (error)="brokenSrc.set(src())">
      }
      <span class="hole"></span>
    </span>
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      aspect-ratio: 1;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    /* The ring takes the outer 14% */
    .disc {
      position: absolute;
      inset: 14%;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ongaku-surface-2);
      box-shadow: 0 18px 48px rgba(0, 0, 0, .4);
      will-change: transform;
    }
    mat-icon {
      width: 96px;
      height: 96px;
      font-size: 96px;
      opacity: .5;
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .hole {
      position: absolute;
      width: 9%;
      height: 9%;
      border-radius: 50%;
      background: var(--ongaku-bg);
      box-shadow: 0 0 0 4px rgba(255, 255, 255, .08);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinningDiscComponent extends PlayerVisual {
  readonly src = input.required<string>();
  /** The cover that could not be loaded: the icon instead, until the next track */
  readonly brokenSrc = signal<string | null>(null);
  readonly broken = computed(() => this.brokenSrc() === this.src());
  private readonly disc = viewChild<ElementRef<HTMLElement>>('disc');
  private angle = 0;

  protected override watch() {
    this.src();
    this.playback.currentTime();
    this.playback.duration();
  }

  protected draw(context: CanvasRenderingContext2D, frame: VisualFrame | undefined, dt: number) {
    if (frame) {
      this.angle = (this.angle + dt * TURN_SPEED) % (Math.PI * 2);
    }
    // Still, the disc keeps the angle where it stopped
    const disc = this.disc()?.nativeElement;
    if (disc) {
      disc.style.transform = `rotate(${this.angle}rad)`;
    }
    const size = Math.min(this.width, this.height);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const inner = size * 0.36 + 6;
    context.lineCap = 'round';
    if (frame) {
      const count = frame.bands.length;
      const reach = size * 0.14 - 10;
      for (let i = 0; i < count; i++) {
        const level = Math.min(1, Math.pow(frame.bands[i], 1.2) * (0.6 + frame.intensity * 0.6));
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const outer = inner + 3 + level * reach;
        context.strokeStyle = rgba(this.colours.accent, 0.35 + level * 0.65);
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        context.stroke();
      }
      return;
    }
    const duration = this.playback.duration();
    const progress = duration ? Math.min(1, this.playback.currentTime() / duration) : 0;
    const radius = inner + 4;
    context.lineWidth = 4;
    context.strokeStyle = rgba(this.colours.muted, 0.3);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    if (progress > 0) {
      context.strokeStyle = this.colours.accent;
      context.beginPath();
      context.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      context.stroke();
    }
  }
}
