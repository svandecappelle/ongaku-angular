import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { map } from 'rxjs/operators';

import { MaterialModule } from '../../modules/material.module';
import { AndroidApp, AndroidAppService } from '../../services/android-app.service';
import { AuthenticationService } from '../../services/authentication.service';
import { formatSize } from '../../services/video.service';

/**
 * The Android application: its download, how to install it, and the link that connects it to
 * this server. Open before signing in (linked from the login page).
 */
@Component({
  selector: 'app-android-page',
  templateUrl: './android-page.component.html',
  styleUrls: ['./android-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
})
export class AndroidPageComponent {
  readonly android = inject(AndroidAppService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly document = inject(DOCUMENT);

  readonly app = toSignal(this.android.info$, { initialValue: null as AndroidApp | null });
  readonly loggedIn = toSignal(inject(AuthenticationService).loginState().pipe(map((state) => !!state)), { initialValue: false });
  readonly server = this.document.location.origin;
  readonly onAndroid = this.android.onAndroid();
  /** ongaku://setup?server=…: a scheme Angular would mark unsafe, built here from this origin only */
  readonly setupLink = inject(DomSanitizer).bypassSecurityTrustUrl(this.android.setupLink());
  readonly copied = signal(false);
  readonly formatSize = formatSize;

  async copyAddress() {
    try {
      await navigator.clipboard.writeText(this.server);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.snackBar.open('Could not access the clipboard', undefined, { duration: 3000 });
    }
  }
}
