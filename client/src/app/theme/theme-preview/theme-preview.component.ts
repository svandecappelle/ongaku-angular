import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { readableOn } from '../color';
import { ThemeColors } from '../themes';

/**
 * Miniature of the app drawn with the given colours. Plain markup on purpose:
 * Material components read the theme from <html>, not from this element.
 */
@Component({
  selector: 'app-theme-preview',
  templateUrl: './theme-preview.component.html',
  styleUrls: ['./theme-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style]': 'variables()',
  },
})
export class ThemePreviewComponent {
  readonly colors = input.required<ThemeColors>();
  /** Shows the sidebar and the player bar, or only the content */
  readonly full = input(true);

  protected readonly variables = computed(() => {
    const c = this.colors();
    return {
      '--p-bg': c.bg,
      '--p-surface': c.surface,
      '--p-surface-2': c.surface2,
      '--p-border': c.border,
      '--p-text': c.text,
      '--p-muted': c.muted,
      '--p-accent': c.accent,
      '--p-on-accent': readableOn(c.accent),
    };
  });

  protected readonly tiles = [1, 0.6, 0.8, 0.45];
}
