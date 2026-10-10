import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { AccentId, Density, ThemeId, ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-appearance',
  templateUrl: './appearance.component.html',
  styleUrls: ['./appearance.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
})
export class AppearanceComponent {
  readonly theme = inject(ThemeService);

  readonly accents = computed(() => {
    const active = this.theme.active();
    return this.theme.accents.map((accent) => ({
      ...accent,
      color: this.theme.accentColor(accent.id, active) ?? active.swatch.accent,
    }));
  });
  readonly accentLabel = computed(() => this.theme.accents.find((a) => a.id === this.theme.accent())?.label);
  readonly percent = (value: number) => `${value}%`;

  // Sample rows for the live preview
  readonly previewTracks = [
    { title: 'Track 1', duration: '3:41' },
    { title: 'Track 2', duration: '4:05' },
    { title: 'Track 3', duration: '2:58' },
    { title: 'Track 4', duration: '5:12' },
  ];

  setTheme(theme: ThemeId) {
    this.theme.setTheme(theme);
  }

  setAccent(accent: AccentId) {
    this.theme.update({ accent });
  }

  setDensity(density: Density) {
    this.theme.update({ density });
  }

  setFollowSystem(followSystem: boolean) {
    this.theme.setFollowSystem(followSystem);
  }

  setShowBackground(showBackground: boolean) {
    this.theme.update({ showBackground });
  }

  setVeil(backgroundVeil: number) {
    this.theme.update({ backgroundVeil });
  }

  reset() {
    this.theme.reset();
  }
}
