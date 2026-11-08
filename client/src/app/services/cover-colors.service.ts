import { Injectable } from '@angular/core';

import { ImageColors, extractImageColors } from '../theme/color';

/** Covers whose colours are kept in memory */
const KEPT = 50;

/** Colours of the cover of a track (average and vivid), for the animations of the player */
@Injectable({ providedIn: 'root' })
export class CoverColorsService {
  private readonly cache = new Map<string, Promise<ImageColors | null>>();

  get(uid: string): Promise<ImageColors | null> {
    let colors = this.cache.get(uid);
    if (colors) {
      // Most recently used last
      this.cache.delete(uid);
    } else {
      // No cover, or unreadable: null, and the animations take the theme's colours
      colors = extractImageColors(`/api/audio/song-image/${encodeURIComponent(uid)}`).catch(() => null);
    }
    this.cache.set(uid, colors);
    while (this.cache.size > KEPT) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return colors;
  }
}
