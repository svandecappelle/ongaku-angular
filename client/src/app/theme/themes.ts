import { isDark, isHex, mix } from './color';

/** Colours of a theme, applied as --ongaku-* CSS variables */
export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

export interface Theme {
  id: string;
  label: string;
  description: string;
  dark: boolean;
  colors: ThemeColors;
  custom: boolean;
}

/** What the user picks in the theme editor; the other colours are derived */
export interface CustomThemeDefinition {
  id: string;
  label: string;
  dark: boolean;
  colors: Pick<ThemeColors, 'bg' | 'surface' | 'text' | 'accent'>;
  /** Derived colours the user chose to set by hand */
  overrides?: Partial<Pick<ThemeColors, 'surface2' | 'border' | 'muted'>>;
}

export const PRESET_THEMES: Theme[] = [
  {
    id: 'nuit', label: 'Nuit', description: 'Dark, teal accent', dark: true, custom: false,
    colors: { bg: '#0F1115', surface: '#171A21', surface2: '#222731', border: '#2C323E', text: '#ECEEF2', muted: '#9AA3B2', accent: '#4FD1C5' },
  },
  {
    id: 'aube', label: 'Aube', description: 'Light and soft', dark: false, custom: false,
    colors: { bg: '#F6F5F2', surface: '#FFFFFF', surface2: '#ECEAE4', border: '#DDD9D0', text: '#1A1B1E', muted: '#5B5E66', accent: '#0F766E' },
  },
  {
    id: 'vinyle', label: 'Vinyle', description: 'Warm dark, amber accent', dark: true, custom: false,
    colors: { bg: '#16110D', surface: '#201914', surface2: '#2D241C', border: '#3B2F25', text: '#F3E9DF', muted: '#B5A596', accent: '#F2A65A' },
  },
  {
    id: 'minuit', label: 'Minuit', description: 'Midnight blue, violet accent', dark: true, custom: false,
    colors: { bg: '#0E0C1A', surface: '#16132A', surface2: '#221E3D', border: '#302A52', text: '#EEEBFF', muted: '#A6A2C8', accent: '#A78BFA' },
  },
];

export const DEFAULT_THEME = 'nuit';
export const DEFAULT_LIGHT_THEME = 'aube';

/** Derived colours of a custom theme (same rules as the preview in the editor) */
export function deriveColors(definition: CustomThemeDefinition): ThemeColors {
  const { bg, surface, text, accent } = definition.colors;
  const overrides = definition.overrides ?? {};
  return {
    bg, surface, text, accent,
    surface2: overrides.surface2 ?? mix(surface, text, 0.07),
    border: overrides.border ?? mix(surface, text, 0.14),
    muted: overrides.muted ?? mix(text, bg, 0.38),
  };
}

export function toTheme(definition: CustomThemeDefinition): Theme {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.dark ? 'Custom, dark' : 'Custom, light',
    dark: definition.dark,
    colors: deriveColors(definition),
    custom: true,
  };
}

/** Validates a custom theme coming from storage or an imported file */
export function parseCustomTheme(value: any): CustomThemeDefinition | null {
  const colors = value?.colors;
  if (!colors || !['bg', 'surface', 'text', 'accent'].every((key) => isHex(colors[key]))) {
    return null;
  }
  const overrides: CustomThemeDefinition['overrides'] = {};
  for (const key of ['surface2', 'border', 'muted'] as const) {
    if (isHex(value.overrides?.[key])) {
      overrides[key] = value.overrides[key].toUpperCase();
    }
  }
  return {
    id: typeof value.id === 'string' && value.id.startsWith('custom-') ? value.id : newCustomThemeId(),
    label: (typeof value.label === 'string' && value.label.trim().slice(0, 40)) || 'My theme',
    dark: typeof value.dark === 'boolean' ? value.dark : isDark(colors.bg),
    colors: {
      bg: colors.bg.toUpperCase(),
      surface: colors.surface.toUpperCase(),
      text: colors.text.toUpperCase(),
      accent: colors.accent.toUpperCase(),
    },
    overrides,
  };
}

export function newCustomThemeId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type AccentId = 'theme' | 'dynamic' | 'teal' | 'amber' | 'violet' | 'rose' | 'blue';

export interface Accent {
  id: AccentId;
  label: string;
  // Variant used on dark themes, and a darker one that stays readable on light themes
  dark: string;
  light: string;
}

export const FIXED_ACCENTS: Accent[] = [
  { id: 'teal', label: 'Teal', dark: '#4FD1C5', light: '#0F766E' },
  { id: 'amber', label: 'Amber', dark: '#F2A65A', light: '#B45309' },
  { id: 'violet', label: 'Violet', dark: '#A78BFA', light: '#6D28D9' },
  { id: 'rose', label: 'Rose', dark: '#F472B6', light: '#BE185D' },
  { id: 'blue', label: 'Blue', dark: '#60A5FA', light: '#1D4ED8' },
];

export type FontId = 'dm-sans' | 'space-grotesk' | 'literata';

export interface FontOption {
  id: FontId;
  label: string;
  description: string;
  /** CSS font-family stack */
  family: string;
}

export const FONTS: FontOption[] = [
  { id: 'dm-sans', label: 'DM Sans', description: 'Modern', family: "'DM Sans Variable', system-ui, sans-serif" },
  { id: 'space-grotesk', label: 'Space Grotesk', description: 'Geometric', family: "'Space Grotesk Variable', system-ui, sans-serif" },
  { id: 'literata', label: 'Literata', description: 'Editorial', family: "'Literata Variable', Georgia, serif" },
];

export type RadiusId = 'sharp' | 'round' | 'pill';

export const RADII: { id: RadiusId; label: string }[] = [
  { id: 'sharp', label: 'Sharp' },
  { id: 'round', label: 'Rounded' },
  { id: 'pill', label: 'Very rounded' },
];
