import { DOCUMENT, Injectable, computed, inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { Layout, ThemeService } from './theme.service';

/**
 * Choice between the classic interface and the new one.
 *
 * The classic components are left untouched: the new shell replaces the header,
 * menu and player (ContentComponent), and new pages are declared before the
 * classic ones on the same path with `canMatch: [modernLayout]`, so a page that
 * has no new version yet is shown in its classic version.
 *
 * `?ui=modern` or `?ui=legacy` in the URL switches the interface too.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly layout = computed(() => this.theme.settings().layout);
  readonly modern = computed(() => this.layout() === 'modern');

  constructor() {
    const ui = new URLSearchParams(inject(DOCUMENT).location.search).get('ui');
    if (ui === 'modern' || ui === 'legacy') {
      this.theme.update({ layout: ui });
    }
  }

  setLayout(layout: Layout) {
    if (layout === this.layout()) {
      return;
    }
    this.theme.update({ layout });
    // Matches the routes again, to show the version of the current page for this interface
    this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: 'reload' });
  }
}

/** Route guard for the pages of the new interface */
export const modernLayout: CanMatchFn = () => inject(LayoutService).modern();
