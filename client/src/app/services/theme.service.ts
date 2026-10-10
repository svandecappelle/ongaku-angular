import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeId = 'nuit' | 'aube' | 'vinyle' | 'minuit';
export type AccentId = 'theme' | 'teal' | 'amber' | 'violet' | 'rose' | 'blue';
export type Density = 'comfortable' | 'compact';

export interface Theme {
  id: ThemeId;
  label: string;
  description: string;
  dark: boolean;
  // Background and accent colours, used for the swatches in the theme picker
  swatch: { background: string; accent: string };
}

export interface Accent {
  id: AccentId;
  label: string;
  // Variant used on dark themes, and a darker one that stays readable on light themes.
  // Null for 'theme', which keeps the theme's own accent.
  dark: string | null;
  light: string | null;
}

export const THEMES: Theme[] = [
  { id: 'nuit', label: 'Nuit', description: 'Dark, teal accent', dark: true, swatch: { background: '#0F1115', accent: '#4FD1C5' } },
  { id: 'aube', label: 'Aube', description: 'Light and soft', dark: false, swatch: { background: '#F6F5F2', accent: '#0F766E' } },
  { id: 'vinyle', label: 'Vinyle', description: 'Warm dark, amber accent', dark: true, swatch: { background: '#16110D', accent: '#F2A65A' } },
  { id: 'minuit', label: 'Minuit', description: 'Midnight blue, violet accent', dark: true, swatch: { background: '#0E0C1A', accent: '#A78BFA' } },
];

export const ACCENTS: Accent[] = [
  { id: 'theme', label: 'Theme accent', dark: null, light: null },
  { id: 'teal', label: 'Teal', dark: '#4FD1C5', light: '#0F766E' },
  { id: 'amber', label: 'Amber', dark: '#F2A65A', light: '#B45309' },
  { id: 'violet', label: 'Violet', dark: '#A78BFA', light: '#6D28D9' },
  { id: 'rose', label: 'Rose', dark: '#F472B6', light: '#BE185D' },
  { id: 'blue', label: 'Blue', dark: '#60A5FA', light: '#1D4ED8' },
];

export const DEFAULT_THEME: ThemeId = 'nuit';
// Theme used when following the system and the system is in light mode
const SYSTEM_LIGHT_THEME: ThemeId = 'aube';
// Key also read by the inline script in index.html to avoid a flash of the wrong theme
const STORAGE_KEY = 'ongaku.theme';

export interface ThemePreference {
  theme: ThemeId;
  followSystem: boolean;
  accent: AccentId;
  density: Density;
  showBackground: boolean;
  /** Opacity of the veil drawn over the background image, 0–100 */
  backgroundVeil: number;
}

export const DEFAULT_PREFERENCE: ThemePreference = {
  theme: DEFAULT_THEME,
  followSystem: false,
  accent: 'theme',
  density: 'comfortable',
  showBackground: true,
  backgroundVeil: 50,
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preference = signal<ThemePreference>(this.load());
  private readonly systemLight = signal(false);

  readonly themes = THEMES;
  readonly accents = ACCENTS;
  /** Theme chosen by the user */
  readonly selected = computed(() => this.preference().theme);
  readonly followSystem = computed(() => this.preference().followSystem);
  readonly accent = computed(() => this.preference().accent);
  readonly density = computed(() => this.preference().density);
  readonly showBackground = computed(() => this.preference().showBackground);
  readonly backgroundVeil = computed(() => this.preference().backgroundVeil);
  /** Theme actually applied, once the system light/dark mode is taken into account */
  readonly active = computed<Theme>(() => {
    const { theme, followSystem } = this.preference();
    let id = theme;
    if (followSystem) {
      const chosen = this.find(theme);
      if (this.systemLight()) {
        id = chosen.dark ? SYSTEM_LIGHT_THEME : theme;
      } else if (!chosen.dark) {
        id = DEFAULT_THEME;
      }
    }
    return this.find(id);
  });

  constructor() {
    const media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: light)');
    if (media) {
      this.systemLight.set(media.matches);
      media.addEventListener('change', (event) => this.systemLight.set(event.matches));
    }

    effect(() => {
      const theme = this.active();
      const root = this.document.documentElement;
      root.dataset['theme'] = theme.id;
      root.style.colorScheme = theme.dark ? 'dark' : 'light';
    });

    effect(() => {
      const root = this.document.documentElement;
      const color = this.accentColor(this.accent(), this.active());
      if (color) {
        root.style.setProperty('--ongaku-accent', color);
        root.style.setProperty('--ongaku-on-accent', this.active().dark ? '#0B0B12' : '#FFFFFF');
      } else {
        // Fall back to the theme's own accent defined in theme.scss
        root.style.removeProperty('--ongaku-accent');
        root.style.removeProperty('--ongaku-on-accent');
      }
    });

    effect(() => {
      const root = this.document.documentElement;
      root.dataset['density'] = this.density();
      root.style.setProperty('--ongaku-veil', `${this.backgroundVeil()}%`);
    });

    effect(() => this.save(this.preference()));
  }

  setTheme(theme: ThemeId) {
    this.update({ theme });
  }

  setFollowSystem(followSystem: boolean) {
    this.update({ followSystem });
  }

  update(changes: Partial<ThemePreference>) {
    this.preference.update((pref) => this.sanitize({ ...pref, ...changes }));
  }

  reset() {
    this.preference.set({ ...DEFAULT_PREFERENCE });
  }

  /** Colour of an accent on the given theme (the theme's own accent for 'theme') */
  accentColor(id: AccentId, theme: Theme): string | null {
    const accent = ACCENTS.find((a) => a.id === id);
    if (!accent?.dark) {
      return null;
    }
    return theme.dark ? accent.dark : accent.light;
  }

  private find(id: ThemeId): Theme {
    return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
  }

  private sanitize(pref: Partial<ThemePreference>): ThemePreference {
    const veil = Number(pref.backgroundVeil);
    return {
      theme: THEMES.some((t) => t.id === pref.theme) ? pref.theme : DEFAULT_PREFERENCE.theme,
      followSystem: !!pref.followSystem,
      accent: ACCENTS.some((a) => a.id === pref.accent) ? pref.accent : DEFAULT_PREFERENCE.accent,
      density: pref.density === 'compact' ? 'compact' : 'comfortable',
      showBackground: pref.showBackground ?? DEFAULT_PREFERENCE.showBackground,
      backgroundVeil: Number.isFinite(veil) ? Math.min(100, Math.max(0, Math.round(veil))) : DEFAULT_PREFERENCE.backgroundVeil,
    };
  }

  private load(): ThemePreference {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (stored && typeof stored === 'object') {
        return this.sanitize({ ...DEFAULT_PREFERENCE, ...stored });
      }
    } catch {
      // Storage unavailable or corrupted: keep the defaults
    }
    return { ...DEFAULT_PREFERENCE };
  }

  private save(pref: ThemePreference) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } catch {
      // Storage unavailable (private mode…): the choice only lasts for this session
    }
  }
}
