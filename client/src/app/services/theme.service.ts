import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

import { ensureContrast, readableOn } from '../theme/color';
import {
  AccentId, CustomThemeDefinition, DEFAULT_LIGHT_THEME, DEFAULT_THEME, FIXED_ACCENTS, FONTS, FontId,
  PRESET_THEMES, RADII, RadiusId, Theme, newCustomThemeId, parseCustomTheme, toTheme,
} from '../theme/themes';

export type Density = 'comfortable' | 'compact';
/** Classic interface, or the new one being built (see LayoutService) */
export type Layout = 'legacy' | 'modern';
/** Automatic switch between a day theme and a night theme */
export type Schedule = 'off' | 'system' | 'timed';

export interface ThemePreference {
  layout: Layout;
  /** Theme used when there is no schedule */
  theme: string;
  schedule: Schedule;
  dayTheme: string;
  nightTheme: string;
  /** "HH:MM", used by the 'timed' schedule */
  dayStart: string;
  nightStart: string;
  accent: AccentId;
  density: Density;
  font: FontId;
  /** Zoom of the page content, in percent */
  contentScale: number;
  radius: RadiusId;
  reduceMotion: boolean;
  showBackground: boolean;
  /** Opacity of the veil drawn over the background image, 0–100 */
  backgroundVeil: number;
  customThemes: CustomThemeDefinition[];
}

export const DEFAULT_PREFERENCE: ThemePreference = {
  layout: 'legacy',
  theme: DEFAULT_THEME,
  schedule: 'off',
  dayTheme: DEFAULT_LIGHT_THEME,
  nightTheme: DEFAULT_THEME,
  dayStart: '07:00',
  nightStart: '20:00',
  accent: 'theme',
  density: 'comfortable',
  font: 'dm-sans',
  contentScale: 100,
  radius: 'round',
  reduceMotion: false,
  showBackground: true,
  backgroundVeil: 50,
  customThemes: [],
};

export const CONTENT_SCALE_MIN = 90;
export const CONTENT_SCALE_MAX = 120;

const STORAGE_KEY = 'ongaku.theme';
// What is currently applied to <html>, re-applied by the inline script in index.html
// before Angular boots, to avoid a flash of the default theme
const APPLIED_KEY = 'ongaku.theme.applied';
const THEME_FILE_FORMAT = 'ongaku-theme';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preference = signal<ThemePreference>(this.load());
  private readonly systemLight = signal(false);
  private readonly minutes = signal(this.currentMinutes());
  /** Vivid colour of the cover being played, set by CoverAccentService */
  private readonly coverColor = signal<string | null>(null);

  readonly presets = PRESET_THEMES;
  readonly fixedAccents = FIXED_ACCENTS;
  readonly fonts = FONTS;
  readonly radii = RADII;

  readonly settings = this.preference.asReadonly();
  readonly customThemes = computed(() => this.preference().customThemes.map(toTheme));
  readonly themes = computed<Theme[]>(() => [...PRESET_THEMES, ...this.customThemes()]);

  readonly schedule = computed(() => this.preference().schedule);
  readonly followSystem = computed(() => this.preference().schedule === 'system');
  readonly accent = computed(() => this.preference().accent);
  readonly density = computed(() => this.preference().density);
  readonly showBackground = computed(() => this.preference().showBackground);
  readonly backgroundVeil = computed(() => this.preference().backgroundVeil);

  /** Which setting the active theme comes from */
  readonly activeSlot = computed<'theme' | 'day' | 'night'>(() => {
    const { schedule, dayStart, nightStart } = this.preference();
    switch (schedule) {
      case 'system':
        return this.systemLight() ? 'day' : 'night';
      case 'timed':
        return this.isDayTime(this.minutes(), dayStart, nightStart) ? 'day' : 'night';
      default:
        return 'theme';
    }
  });

  /** Id of the theme in use (the one ticked in the pickers) */
  readonly selected = computed(() => {
    const pref = this.preference();
    const slot = this.activeSlot();
    return slot === 'day' ? pref.dayTheme : slot === 'night' ? pref.nightTheme : pref.theme;
  });

  /** Theme in use, with the accent the user picked */
  readonly active = computed<Theme>(() => {
    const theme = this.find(this.selected());
    return { ...theme, colors: { ...theme.colors, accent: this.accentColor(this.accent(), theme) } };
  });

  constructor() {
    const view = this.document.defaultView;
    const media = view?.matchMedia?.('(prefers-color-scheme: light)');
    if (media) {
      this.systemLight.set(media.matches);
      media.addEventListener('change', (event) => this.systemLight.set(event.matches));
    }
    // Clock for the 'timed' schedule
    view?.setInterval(() => this.minutes.set(this.currentMinutes()), 60_000);

    effect(() => this.apply());
    effect(() => this.save(STORAGE_KEY, this.preference()));
  }

  setTheme(id: string) {
    const slot = this.activeSlot();
    this.update(slot === 'day' ? { dayTheme: id } : slot === 'night' ? { nightTheme: id } : { theme: id });
  }

  setFollowSystem(followSystem: boolean) {
    const active = this.find(this.selected());
    if (followSystem) {
      // Keep the current theme for its half of the day
      this.update(active.dark
        ? { schedule: 'system', nightTheme: active.id }
        : { schedule: 'system', dayTheme: active.id });
    } else {
      this.update({ schedule: 'off', theme: active.id });
    }
  }

  update(changes: Partial<ThemePreference>) {
    this.preference.update((pref) => this.sanitize({ ...pref, ...changes }));
  }

  /** Back to the default settings; custom themes and the interface choice are kept */
  reset() {
    this.preference.update((pref) => ({ ...DEFAULT_PREFERENCE, customThemes: pref.customThemes, layout: pref.layout }));
  }

  setCoverColor(color: string | null) {
    this.coverColor.set(color);
  }

  /** Colour of an accent on the given theme */
  accentColor(id: AccentId, theme: Theme): string {
    if (id === 'dynamic') {
      const cover = this.coverColor();
      return cover ? ensureContrast(cover, theme.colors.bg, 3) : theme.colors.accent;
    }
    const fixed = FIXED_ACCENTS.find((accent) => accent.id === id);
    if (!fixed) {
      return theme.colors.accent;
    }
    return theme.dark ? fixed.dark : fixed.light;
  }

  find(id: string): Theme {
    return this.themes().find((theme) => theme.id === id) ?? PRESET_THEMES[0];
  }

  customTheme(id: string): CustomThemeDefinition | undefined {
    return this.preference().customThemes.find((theme) => theme.id === id);
  }

  /** Adds or replaces a custom theme */
  saveCustomTheme(definition: CustomThemeDefinition) {
    const customThemes = this.preference().customThemes.filter((theme) => theme.id !== definition.id);
    const index = this.preference().customThemes.findIndex((theme) => theme.id === definition.id);
    customThemes.splice(index < 0 ? customThemes.length : index, 0, definition);
    this.update({ customThemes });
  }

  duplicateCustomTheme(id: string): CustomThemeDefinition | null {
    const source = this.customTheme(id);
    if (!source) {
      return null;
    }
    const copy = { ...structuredClone(source), id: newCustomThemeId(), label: `${source.label} copy`.slice(0, 40) };
    this.saveCustomTheme(copy);
    return copy;
  }

  /** Removes a custom theme; settings that used it fall back to the default themes */
  deleteCustomTheme(id: string): CustomThemeDefinition | null {
    const removed = this.customTheme(id);
    if (!removed) {
      return null;
    }
    const pref = this.preference();
    this.update({
      customThemes: pref.customThemes.filter((theme) => theme.id !== id),
      theme: pref.theme === id ? DEFAULT_THEME : pref.theme,
      dayTheme: pref.dayTheme === id ? DEFAULT_LIGHT_THEME : pref.dayTheme,
      nightTheme: pref.nightTheme === id ? DEFAULT_THEME : pref.nightTheme,
    });
    return removed;
  }

  exportCustomTheme(id: string): string | null {
    const theme = this.customTheme(id);
    if (!theme) {
      return null;
    }
    const { label, dark, colors, overrides } = theme;
    return JSON.stringify({ format: THEME_FILE_FORMAT, version: 1, label, dark, colors, overrides }, null, 2);
  }

  /** Imports a theme exported by exportCustomTheme; returns null when the content is not a valid theme */
  importCustomTheme(json: string): CustomThemeDefinition | null {
    let value: any;
    try {
      value = JSON.parse(json);
    } catch {
      return null;
    }
    if (value?.format !== THEME_FILE_FORMAT) {
      return null;
    }
    const theme = parseCustomTheme({ ...value, id: undefined });
    if (theme) {
      this.saveCustomTheme(theme);
    }
    return theme;
  }

  private apply() {
    const pref = this.preference();
    const theme = this.active();
    const colors = theme.colors;
    const font = FONTS.find((f) => f.id === pref.font) ?? FONTS[0];

    const attributes: Record<string, string> = {
      layout: pref.layout,
      theme: theme.id,
      mode: theme.dark ? 'dark' : 'light',
      density: pref.density,
      radius: pref.radius,
      motion: pref.reduceMotion ? 'reduced' : 'full',
    };
    const variables: Record<string, string> = {
      '--ongaku-bg': colors.bg,
      '--ongaku-surface': colors.surface,
      '--ongaku-surface-2': colors.surface2,
      '--ongaku-border': colors.border,
      '--ongaku-text': colors.text,
      '--ongaku-muted': colors.muted,
      '--ongaku-accent': colors.accent,
      '--ongaku-on-accent': readableOn(colors.accent),
      '--ongaku-font': font.family,
      '--ongaku-content-scale': String(pref.contentScale / 100),
      '--ongaku-veil': `${pref.backgroundVeil}%`,
    };

    const root = this.document.documentElement;
    for (const [name, value] of Object.entries(attributes)) {
      root.dataset[name] = value;
    }
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
    root.style.colorScheme = theme.dark ? 'dark' : 'light';
    this.save(APPLIED_KEY, { attributes, variables, dark: theme.dark });
  }

  private isDayTime(minutes: number, dayStart: string, nightStart: string): boolean {
    const day = this.toMinutes(dayStart);
    const night = this.toMinutes(nightStart);
    // Handles both "day 07:00 → night 20:00" and an inverted range
    return day <= night ? minutes >= day && minutes < night : minutes >= day || minutes < night;
  }

  private toMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private currentMinutes(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  private sanitize(pref: Partial<ThemePreference>): ThemePreference {
    const d = DEFAULT_PREFERENCE;
    const customThemes = (Array.isArray(pref.customThemes) ? pref.customThemes : [])
      .map(parseCustomTheme)
      .filter((theme): theme is CustomThemeDefinition => !!theme);
    const ids = [...PRESET_THEMES.map((t) => t.id), ...customThemes.map((t) => t.id)];
    const themeId = (value: unknown, fallback: string) => (ids.includes(value as string) ? (value as string) : fallback);
    const number = (value: unknown, fallback: number, min: number, max: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
    };
    return {
      layout: pref.layout === 'modern' ? 'modern' : 'legacy',
      theme: themeId(pref.theme, d.theme),
      schedule: (['off', 'system', 'timed'] as const).find((s) => s === pref.schedule) ?? d.schedule,
      dayTheme: themeId(pref.dayTheme, d.dayTheme),
      nightTheme: themeId(pref.nightTheme, d.nightTheme),
      dayStart: TIME.test(pref.dayStart ?? '') ? pref.dayStart : d.dayStart,
      nightStart: TIME.test(pref.nightStart ?? '') ? pref.nightStart : d.nightStart,
      accent: ['theme', 'dynamic', ...FIXED_ACCENTS.map((a) => a.id)].includes(pref.accent) ? pref.accent : d.accent,
      density: pref.density === 'compact' ? 'compact' : 'comfortable',
      font: FONTS.some((f) => f.id === pref.font) ? pref.font : d.font,
      contentScale: number(pref.contentScale, d.contentScale, CONTENT_SCALE_MIN, CONTENT_SCALE_MAX),
      radius: RADII.some((r) => r.id === pref.radius) ? pref.radius : d.radius,
      reduceMotion: !!pref.reduceMotion,
      showBackground: pref.showBackground ?? d.showBackground,
      backgroundVeil: number(pref.backgroundVeil, d.backgroundVeil, 0, 100),
      customThemes,
    };
  }

  private load(): ThemePreference {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (stored && typeof stored === 'object') {
        // Settings saved before schedules existed
        if (stored.followSystem && !stored.schedule) {
          const dark = PRESET_THEMES.find((t) => t.id === stored.theme)?.dark ?? true;
          stored.schedule = 'system';
          stored.nightTheme = dark ? stored.theme : DEFAULT_THEME;
        }
        return this.sanitize({ ...DEFAULT_PREFERENCE, ...stored });
      }
    } catch {
      // Storage unavailable or corrupted: keep the defaults
    }
    return { ...DEFAULT_PREFERENCE };
  }

  private save(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode…): settings only last for this session
    }
  }
}
