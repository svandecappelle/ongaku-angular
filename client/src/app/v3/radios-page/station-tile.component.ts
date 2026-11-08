import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Muted backgrounds that keep light initials readable, picked from the name */
const COLOURS = ['#2a4d5a', '#4a3a5e', '#5a4a2e', '#2e5a46', '#5a2e3e', '#3b3f6e', '#4d4a2a', '#2e4a5a'];

/** The logo of an internet station: its initials on a colour chosen from its name */
@Component({
  selector: 'app-station-tile',
  template: `<span aria-hidden="true">{{ initials() }}</span>`,
  styles: [`
    :host {
      display: grid;
      place-items: center;
      flex: none;
      aspect-ratio: 1;
      border-radius: var(--ongaku-radius-md, 12px);
      color: #eceef2;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1;
      user-select: none;
    }
  `],
  host: {
    '[style.background]': 'colour()',
    '[style.width]': 'size() + "px"',
    '[style.font-size]': 'size() * 0.36 + "px"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationTileComponent {
  readonly name = input.required<string>();
  /** Side, in pixels */
  readonly size = input(48);

  readonly initials = computed(() => {
    const words = this.name().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  });

  readonly colour = computed(() => {
    let hash = 0;
    for (const char of this.name()) {
      hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
    }
    return COLOURS[hash % COLOURS.length];
  });
}
