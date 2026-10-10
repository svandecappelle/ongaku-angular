import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../../modules/material.module';
import { ThemeService } from '../../services/theme.service';
import { contrast, ensureContrast, extractImageColors, isHex, mix, readableOn } from '../color';
import { CustomThemeDefinition, PRESET_THEMES, Theme, ThemeColors, deriveColors, newCustomThemeId } from '../themes';
import { ThemePreviewComponent } from '../theme-preview/theme-preview.component';

type BaseColor = 'bg' | 'surface' | 'text' | 'accent';
type DerivedColor = 'surface2' | 'border' | 'muted';

interface ContrastCheck {
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  ok: boolean;
}

@Component({
  selector: 'app-theme-editor',
  templateUrl: './theme-editor.component.html',
  styleUrls: ['./theme-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, ThemePreviewComponent],
})
export class ThemeEditorComponent {
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly presets = PRESET_THEMES;
  /** Theme being edited, or a new one */
  readonly definition = signal<CustomThemeDefinition>(this.initial(inject(ActivatedRoute).snapshot.paramMap.get('id')));
  readonly isNew = !this.themeService.customTheme(this.definition().id);
  readonly advanced = signal(false);
  readonly extracting = signal(false);

  readonly colors = computed<ThemeColors>(() => deriveColors(this.definition()));

  readonly baseRows: { key: BaseColor; label: string; description: string }[] = [
    { key: 'bg', label: 'Background', description: 'Behind everything' },
    { key: 'surface', label: 'Surfaces', description: 'Menu, cards, player' },
    { key: 'text', label: 'Text', description: 'Titles and main text' },
    { key: 'accent', label: 'Accent', description: 'Buttons, progress, links' },
  ];
  readonly derivedRows: { key: DerivedColor; label: string; description: string }[] = [
    { key: 'surface2', label: 'Secondary surface', description: 'Empty covers, active items' },
    { key: 'border', label: 'Borders', description: 'Separators and outlines' },
    { key: 'muted', label: 'Secondary text', description: 'Durations, subtitles' },
  ];

  readonly checks = computed<ContrastCheck[]>(() => {
    const c = this.colors();
    const check = (label: string, foreground: string, background: string, min: number): ContrastCheck => {
      const ratio = contrast(foreground, background);
      return { label, foreground, background, ratio, ok: ratio >= min };
    };
    return [
      check('Text on background', c.text, c.bg, 4.5),
      check('Text on surfaces', c.text, c.surface, 4.5),
      check('Secondary text on background', c.muted, c.bg, 4.5),
      check('Text on a primary button', readableOn(c.accent), c.accent, 4.5),
      check('Accent on background (links, icons)', c.accent, c.bg, 3),
    ];
  });
  readonly allChecksPass = computed(() => this.checks().every((check) => check.ok));

  setLabel(label: string) {
    this.definition.update((d) => ({ ...d, label }));
  }

  setColor(key: BaseColor, value: string) {
    if (isHex(value)) {
      const hex = (value.startsWith('#') ? value : `#${value}`).toUpperCase();
      this.definition.update((d) => ({ ...d, colors: { ...d.colors, [key]: hex } }));
    }
  }

  setDerived(key: DerivedColor, value: string) {
    if (isHex(value)) {
      const hex = (value.startsWith('#') ? value : `#${value}`).toUpperCase();
      this.definition.update((d) => ({ ...d, overrides: { ...d.overrides, [key]: hex } }));
    }
  }

  resetDerived(key: DerivedColor) {
    this.definition.update((d) => {
      const overrides = { ...d.overrides };
      delete overrides[key];
      return { ...d, overrides };
    });
  }

  isOverridden(key: DerivedColor): boolean {
    return !!this.definition().overrides?.[key];
  }

  /** Switching mode swaps background and text and recomputes the surface */
  setDark(dark: boolean) {
    const d = this.definition();
    if (d.dark === dark) {
      return;
    }
    const { bg, text, accent } = d.colors;
    const newBg = text;
    this.definition.set({
      ...d,
      dark,
      colors: {
        bg: newBg,
        text: bg,
        surface: dark ? mix(newBg, '#FFFFFF', 0.05) : '#FFFFFF',
        accent: ensureContrast(accent, newBg, 3),
      },
      overrides: {},
    });
  }

  startFrom(theme: Theme) {
    const { bg, surface, text, accent } = theme.colors;
    this.definition.update((d) => ({ ...d, dark: theme.dark, colors: { bg, surface, text, accent }, overrides: {} }));
  }

  /** Builds a palette from the user's background image */
  async startFromBackgroundImage() {
    this.extracting.set(true);
    try {
      const { average, vibrant } = await extractImageColors('/api/user/image/background');
      const dark = this.definition().dark;
      const bg = dark ? mix(average, '#000000', 0.82) : mix(average, '#FFFFFF', 0.9);
      const text = dark ? mix('#FFFFFF', average, 0.08) : mix('#000000', average, 0.1);
      const surface = dark ? mix(bg, '#FFFFFF', 0.05) : mix(bg, '#FFFFFF', 0.7);
      const accent = ensureContrast(vibrant ?? mix(average, dark ? '#FFFFFF' : '#000000', 0.3), bg, 3);
      this.definition.update((d) => ({ ...d, colors: { bg, surface, text, accent }, overrides: {} }));
    } catch {
      this.snackBar.open('Could not read your background image', undefined, { duration: 4000 });
    } finally {
      this.extracting.set(false);
    }
  }

  save() {
    const definition = { ...this.definition(), label: this.definition().label.trim() || 'My theme' };
    this.themeService.saveCustomTheme(definition);
    this.themeService.setTheme(definition.id);
    this.router.navigate(['/profile/appearance']);
  }

  export() {
    // Exports the theme as currently edited, saved or not (same format as ThemeService.exportCustomTheme)
    const { label, dark, colors, overrides } = this.definition();
    const json = JSON.stringify({ format: 'ongaku-theme', version: 1, label, dark, colors, overrides }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(label || 'theme').replace(/[^\w-]+/g, '-').toLowerCase()}.ongaku-theme.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private initial(id: string | null): CustomThemeDefinition {
    const existing = id ? this.themeService.customTheme(id) : undefined;
    if (existing) {
      return structuredClone(existing);
    }
    // New theme: start from the theme in use
    const active = this.themeService.find(this.themeService.selected());
    const { bg, surface, text, accent } = active.colors;
    return { id: newCustomThemeId(), label: 'My theme', dark: active.dark, colors: { bg, surface, text, accent }, overrides: {} };
  }
}
