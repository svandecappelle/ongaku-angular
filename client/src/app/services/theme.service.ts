import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeId = 'nuit' | 'aube' | 'vinyle' | 'minuit';

export interface Theme {
  id: ThemeId;
  label: string;
  description: string;
  dark: boolean;
  // Background and accent colours, used for the swatches in the theme picker
  swatch: { background: string; accent: string };
}

export const THEMES: Theme[] = [
  { id: 'nuit', label: 'Nuit', description: 'Dark, teal accent', dark: true, swatch: { background: '#0F1115', accent: '#4FD1C5' } },
  { id: 'aube', label: 'Aube', description: 'Light and soft', dark: false, swatch: { background: '#F6F5F2', accent: '#0F766E' } },
  { id: 'vinyle', label: 'Vinyle', description: 'Warm dark, amber accent', dark: true, swatch: { background: '#16110D', accent: '#F2A65A' } },
  { id: 'minuit', label: 'Minuit', description: 'Midnight blue, violet accent', dark: true, swatch: { background: '#0E0C1A', accent: '#A78BFA' } },
];

export const DEFAULT_THEME: ThemeId = 'nuit';
// Theme used when following the system and the system is in light mode
const SYSTEM_LIGHT_THEME: ThemeId = 'aube';
// Key also read by the inline script in index.html to avoid a flash of the wrong theme
const STORAGE_KEY = 'ongaku.theme';

interface ThemePreference {
  theme: ThemeId;
  followSystem: boolean;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preference = signal<ThemePreference>(this.load());
  private readonly systemLight = signal(false);

  readonly themes = THEMES;
  /** Theme chosen by the user */
  readonly selected = computed(() => this.preference().theme);
  readonly followSystem = computed(() => this.preference().followSystem);
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

    effect(() => this.save(this.preference()));
  }

  setTheme(theme: ThemeId) {
    this.preference.update((pref) => ({ ...pref, theme }));
  }

  setFollowSystem(followSystem: boolean) {
    this.preference.update((pref) => ({ ...pref, followSystem }));
  }

  private find(id: ThemeId): Theme {
    return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
  }

  private load(): ThemePreference {
    const fallback: ThemePreference = { theme: DEFAULT_THEME, followSystem: false };
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (stored && THEMES.some((theme) => theme.id === stored.theme)) {
        return { theme: stored.theme, followSystem: !!stored.followSystem };
      }
    } catch {
      // Storage unavailable or corrupted: keep the default theme
    }
    return fallback;
  }

  private save(pref: ThemePreference) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } catch {
      // Storage unavailable (private mode…): the choice only lasts for this session
    }
  }
}
