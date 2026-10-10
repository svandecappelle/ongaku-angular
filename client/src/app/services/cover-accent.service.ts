import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { combineLatest, from, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { IAppState } from '../app-state';
import { extractImageColors } from '../theme/color';
import { ThemeService } from './theme.service';

/**
 * Feeds ThemeService with the vivid colour of the cover being played,
 * for the "dynamic" accent. Does nothing while another accent is selected.
 */
@Injectable({ providedIn: 'root' })
export class CoverAccentService {
  private readonly store = inject<Store<IAppState>>(Store);
  private readonly theme = inject(ThemeService);

  constructor() {
    const trackUid$ = this.store.select((state) => state.player?.track?.uid ?? null).pipe(distinctUntilChanged());
    const dynamic$ = toObservable(this.theme.accent).pipe(map((accent) => accent === 'dynamic'), distinctUntilChanged());

    combineLatest([trackUid$, dynamic$]).pipe(
      switchMap(([uid, dynamic]) => {
        if (!dynamic || !uid) {
          return of(null);
        }
        return from(extractImageColors(`/api/audio/song-image/${encodeURIComponent(String(uid))}`)).pipe(
          map((colors) => colors.vibrant),
          // No cover or unreadable image: fall back to the theme's accent
          catchError(() => of(null)),
        );
      }),
    ).subscribe((color) => this.theme.setCoverColor(color));
  }
}
