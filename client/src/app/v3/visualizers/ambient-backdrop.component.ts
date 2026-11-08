import { ChangeDetectionStrategy, Component } from '@angular/core';

import { VisualFrame } from '../../services/visualizer.service';
import { PlayerVisual, rgba } from './player-visual';

/** Size of the drawing, scaled up: the blur of the shapes costs nothing that way */
const SMALL_WIDTH = 96;
const SMALL_HEIGHT = 54;

interface Blob {
  colour: 'coverA' | 'coverB' | 'accent';
  /** Radius, in pixels of the small drawing */
  radius: number;
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  phase: number;
}

const BLOBS: Blob[] = [
  { colour: 'coverA', radius: 34, x: 0.3, y: 0.4, speedX: 0.9, speedY: 1.1, phase: 0 },
  { colour: 'coverB', radius: 26, x: 0.7, y: 0.6, speedX: 1.2, speedY: 0.8, phase: 2 },
  { colour: 'accent', radius: 20, x: 0.55, y: 0.25, speedX: 0.7, speedY: 1.3, phase: 4 },
];

/**
 * Blurred shapes in the colours of the cover, drifting behind the player: a little faster and
 * larger when the music is louder. Still, the same colours as a gradient that does not move.
 */
@Component({
  selector: 'app-ambient-backdrop',
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: [`
    :host {
      display: block;
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
export class AmbientBackdropComponent extends PlayerVisual {
  private readonly small = document.createElement('canvas');
  private drift = 0;

  constructor() {
    super();
    this.small.width = SMALL_WIDTH;
    this.small.height = SMALL_HEIGHT;
  }

  protected draw(context: CanvasRenderingContext2D, frame: VisualFrame | undefined, dt: number) {
    const small = this.small.getContext('2d');
    if (!small) {
      return;
    }
    const loudness = frame ? frame.loudness * frame.intensity : 0.1;
    this.drift += dt * (0.12 + loudness * 1.6);
    small.fillStyle = this.colours.background;
    small.fillRect(0, 0, SMALL_WIDTH, SMALL_HEIGHT);
    for (const blob of BLOBS) {
      const t = this.drift + blob.phase;
      const x = (blob.x + Math.sin(t * blob.speedX) * 0.12) * SMALL_WIDTH;
      const y = (blob.y + Math.cos(t * blob.speedY) * 0.14) * SMALL_HEIGHT;
      const radius = blob.radius * (1 + loudness * 0.8);
      const gradient = small.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba(this.colours[blob.colour], 0.55));
      gradient.addColorStop(1, rgba(this.colours[blob.colour], 0));
      small.fillStyle = gradient;
      small.fillRect(0, 0, SMALL_WIDTH, SMALL_HEIGHT);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.small, 0, 0, this.width, this.height);
  }
}
