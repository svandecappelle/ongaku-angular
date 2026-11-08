import { ChangeDetectionStrategy, Component } from '@angular/core';

import { VisualFrame } from '../../services/visualizer.service';
import { PlayerVisual, rgba } from './player-visual';

/**
 * A halo in the colours of the cover, behind it: it swells with the low frequencies and settles
 * between the beats. Still, a soft halo. The host is placed around the cover by its parent.
 */
@Component({
  selector: 'app-cover-glow',
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
export class CoverGlowComponent extends PlayerVisual {
  protected draw(context: CanvasRenderingContext2D, frame: VisualFrame | undefined) {
    const { width, height, colours } = this;
    const energy = frame ? frame.bass * frame.intensity : 0.2;
    const cx = width / 2;
    const cy = height / 2;
    // The cover takes about 3/4 of the host: the halo starts at its edge
    const inner = Math.min(width, height) * 0.3;
    const outer = Math.min(width, height) * (0.46 + energy * 0.08);
    const gradient = context.createRadialGradient(cx, cy, inner, cx, cy, outer);
    gradient.addColorStop(0, rgba(colours.coverB, 0.4 + energy * 0.35));
    gradient.addColorStop(0.5, rgba(colours.coverA, 0.25 + energy * 0.25));
    gradient.addColorStop(1, rgba(colours.coverA, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
}
