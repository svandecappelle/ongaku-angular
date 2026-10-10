import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../../modules/material.module';
import { CONTENT_SCALE_MAX, CONTENT_SCALE_MIN, Density, Layout, Schedule, ThemeService } from '../../services/theme.service';
import { LayoutService } from '../../services/layout.service';
import { ThemePreviewComponent } from '../../theme/theme-preview/theme-preview.component';
import { AccentId, FontId, RadiusId } from '../../theme/themes';

type AccentMode = 'theme' | 'fixed' | 'dynamic';

@Component({
  selector: 'app-appearance',
  templateUrl: './appearance.component.html',
  styleUrls: ['./appearance.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, ThemePreviewComponent],
})
export class AppearanceComponent {
  readonly theme = inject(ThemeService);
  readonly layout = inject(LayoutService);
  private readonly snackBar = inject(MatSnackBar);

  readonly settings = this.theme.settings;
  readonly scaleMin = CONTENT_SCALE_MIN;
  readonly scaleMax = CONTENT_SCALE_MAX;

  readonly layouts: { id: Layout; label: string; description: string }[] = [
    { id: 'modern', label: 'New', description: 'Side navigation, new player and queue panel' },
    { id: 'legacy', label: 'Classic', description: 'Top bar, icon menu and the former pages' },
  ];

  readonly accentModes: { id: AccentMode; label: string; description: string }[] = [
    { id: 'theme', label: 'Theme accent', description: 'The colour chosen by the theme' },
    { id: 'fixed', label: 'Fixed colour', description: 'Always the same colour' },
    { id: 'dynamic', label: 'Dynamic', description: 'Follows the cover being played' },
  ];
  readonly accentMode = computed<AccentMode>(() => {
    const accent = this.settings().accent;
    return accent === 'theme' || accent === 'dynamic' ? accent : 'fixed';
  });
  readonly swatches = computed(() => {
    const active = this.theme.find(this.theme.selected());
    return this.theme.fixedAccents.map((accent) => ({ ...accent, color: active.dark ? accent.dark : accent.light }));
  });

  readonly schedules: { id: Schedule; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'system', label: 'Follow the system' },
    { id: 'timed', label: 'By time of day' },
  ];

  readonly percent = (value: number) => `${value}%`;

  setTheme(id: string) {
    this.theme.setTheme(id);
  }

  setAccentMode(mode: AccentMode) {
    if (mode === 'fixed') {
      if (this.accentMode() !== 'fixed') {
        this.theme.update({ accent: this.theme.fixedAccents[0].id });
      }
    } else {
      this.theme.update({ accent: mode });
    }
  }

  setAccent(accent: AccentId) {
    this.theme.update({ accent });
  }

  setFont(font: FontId) {
    this.theme.update({ font });
  }

  setContentScale(contentScale: number) {
    this.theme.update({ contentScale });
  }

  setRadius(radius: RadiusId) {
    this.theme.update({ radius });
  }

  setDensity(density: Density) {
    this.theme.update({ density });
  }

  setReduceMotion(reduceMotion: boolean) {
    this.theme.update({ reduceMotion });
  }

  setSchedule(schedule: Schedule) {
    this.theme.update({ schedule });
  }

  setScheduleTheme(slot: 'dayTheme' | 'nightTheme', id: string) {
    this.theme.update({ [slot]: id });
  }

  setScheduleTime(slot: 'dayStart' | 'nightStart', time: string) {
    this.theme.update({ [slot]: time });
  }

  setShowBackground(showBackground: boolean) {
    this.theme.update({ showBackground });
  }

  setVeil(backgroundVeil: number) {
    this.theme.update({ backgroundVeil });
  }

  duplicate(id: string) {
    const copy = this.theme.duplicateCustomTheme(id);
    if (copy) {
      this.snackBar.open(`“${copy.label}” created`, undefined, { duration: 3000 });
    }
  }

  async share(id: string) {
    const json = this.theme.exportCustomTheme(id);
    if (!json) {
      return;
    }
    try {
      await navigator.clipboard.writeText(json);
      this.snackBar.open('Theme copied to the clipboard. Paste it in “Import a theme”.', undefined, { duration: 4000 });
    } catch {
      this.snackBar.open('Could not access the clipboard', undefined, { duration: 4000 });
    }
  }

  delete(id: string) {
    // Undo restores the theme and the settings that used it
    const before = this.settings();
    const removed = this.theme.deleteCustomTheme(id);
    if (removed) {
      this.snackBar.open(`“${removed.label}” deleted`, 'Undo', { duration: 6000 })
        .onAction().subscribe(() => this.theme.update(before));
    }
  }

  async importFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.import(await file.text());
    }
  }

  async importFromClipboard() {
    try {
      this.import(await navigator.clipboard.readText());
    } catch {
      this.snackBar.open('Could not access the clipboard', undefined, { duration: 4000 });
    }
  }

  reset() {
    this.theme.reset();
  }

  private import(json: string) {
    const theme = this.theme.importCustomTheme(json);
    this.snackBar.open(theme ? `“${theme.label}” imported` : 'This is not an Ongaku theme', undefined, { duration: 4000 });
  }
}
