import { DOCUMENT, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

/** The Android application of the server (server/app/routes/android.js) */
export interface AndroidApp {
  available: boolean;
  versionName?: string;
  versionCode?: number | null;
  size?: number;
  built?: string | null;
  download?: string;
}

const PACKAGE = 'io.github.svandecappelle.ongaku';
const INSIDE_KEY = 'ongaku.insideAndroidApp';

@Injectable({ providedIn: 'root' })
export class AndroidAppService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  /** Asked once a visit */
  readonly info$: Observable<AndroidApp> = this.http.get<AndroidApp>('/api/app/android').pipe(
    catchError(() => of({ available: false })),
    shareReplay(1),
  );

  /**
   * The page is shown by the Android application: Chrome tells it in the referrer of the
   * first page only, so it is kept for the visit.
   */
  readonly insideApp = this.detectInsideApp();

  /** Opens the setup screen of the installed application, with this server filled in */
  setupLink(): string {
    return `ongaku://setup?server=${encodeURIComponent(this.document.location.origin)}`;
  }

  /** The phone is an Android one */
  onAndroid(): boolean {
    return /Android/i.test(this.document.defaultView?.navigator.userAgent ?? '');
  }

  private detectInsideApp(): boolean {
    const storage = this.document.defaultView?.sessionStorage;
    try {
      if (this.document.referrer.startsWith(`android-app://${PACKAGE}`)) {
        storage?.setItem(INSIDE_KEY, '1');
        return true;
      }
      return storage?.getItem(INSIDE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
