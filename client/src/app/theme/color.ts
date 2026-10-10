// Colour helpers for themes: mixing, WCAG contrast and colour extraction from images.

export type Rgb = [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value ?? '');
}

export function toRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Mix `a` towards `b`: t = 0 gives a, t = 1 gives b */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 to 21 */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.18;
}

/** Lighten (on a dark background) or darken (on a light one) `color` until it reaches `min` contrast */
export function ensureContrast(color: string, background: string, min: number): string {
  const target = isDark(background) ? '#FFFFFF' : '#000000';
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = mix(color, target, t);
    if (contrast(candidate, background) >= min) {
      return candidate;
    }
  }
  return target;
}

/** Text colour (near black or white) that reads best on `background` */
export function readableOn(background: string): string {
  return contrast('#0B0B12', background) >= contrast('#FFFFFF', background) ? '#0B0B12' : '#FFFFFF';
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

export interface ImageColors {
  /** Average colour of the whole image */
  average: string;
  /** Most present vivid colour, or null when the image is mostly grey */
  vibrant: string | null;
}

const SAMPLE_SIZE = 48;
const HUE_BUCKETS = 24;

/**
 * Reads the average and the dominant vivid colour of an image.
 * The image must be same-origin (our /api routes), otherwise the canvas cannot be read.
 */
export function extractImageColors(url: string): Promise<ImageColors> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onerror = () => reject(new Error(`Cannot load ${url}`));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

        const total: Rgb = [0, 0, 0];
        let count = 0;
        const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, rgb: [0, 0, 0] as Rgb, n: 0 }));
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) {
            continue;
          }
          const rgb: Rgb = [data[i], data[i + 1], data[i + 2]];
          total[0] += rgb[0]; total[1] += rgb[1]; total[2] += rgb[2];
          count++;
          const [h, s, l] = rgbToHsl(rgb);
          if (s < 0.25 || l < 0.12 || l > 0.88) {
            continue;
          }
          const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS];
          bucket.weight += s;
          bucket.n++;
          bucket.rgb[0] += rgb[0]; bucket.rgb[1] += rgb[1]; bucket.rgb[2] += rgb[2];
        }
        if (count === 0) {
          reject(new Error('Empty image'));
          return;
        }
        const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
        // Ignore a vivid colour that covers only a few pixels
        const vibrant = best.n >= count * 0.04
          ? toHex(best.rgb.map((v) => v / best.n) as Rgb)
          : null;
        resolve({ average: toHex(total.map((v) => v / count) as Rgb), vibrant });
      } catch (error) {
        reject(error);
      }
    };
    image.src = url;
  });
}
