import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs/operators';

import { MaterialModule } from '../modules/material.module';
import { AuthenticationService } from '../services/authentication.service';
import { AuthCardComponent } from '../auth-card/auth-card.component';
import { MIN_PASSWORD, USERNAME_PATTERN, samePasswords } from '../user/register/register.component';
import { InstallService } from './install.service';

/** First start of a server (/install): creates the administrator account, then signs it in */
@Component({
  selector: 'app-install',
  templateUrl: './install.component.html',
  styleUrls: ['./install.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule, AuthCardComponent],
})
export class InstallComponent {
  private readonly installer = inject(InstallService);
  private readonly auth = inject(AuthenticationService);
  private readonly router = inject(Router);

  readonly minPassword = MIN_PASSWORD;
  readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN), Validators.maxLength(40)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD)]],
    confirmPassword: ['', Validators.required],
  }, { validators: samePasswords });

  /** checking: asking the server whether it is installed */
  readonly state = signal<'checking' | 'ready'>('checking');
  readonly step = signal<'idle' | 'installing' | 'signing-in'>('idle');
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  constructor() {
    this.installer.check().subscribe({
      next: (result) => {
        if (result?.version) {
          // Already installed: nothing to do here
          this.router.navigate(['/login']);
        } else {
          this.state.set('ready');
        }
      },
      error: () => this.state.set('ready'),
    });
  }

  submit() {
    if (this.step() !== 'idle') {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, email, password } = this.form.getRawValue();
    this.step.set('installing');
    this.error.set(null);
    this.installer.install({ username: username.trim(), email: email.trim(), password }).pipe(
      switchMap(() => {
        this.step.set('signing-in');
        return this.auth.login(username.trim(), password, true);
      }),
    ).subscribe({
      next: () => this.router.navigate(['/']),
      error: (err: HttpErrorResponse) => {
        if (this.step() === 'signing-in') {
          // Installed, but the automatic sign in failed: the login page does it
          this.router.navigate(['/login']);
          return;
        }
        this.step.set('idle');
        if (err.status === 403) {
          this.router.navigate(['/login']);
        } else if (err.status === 0) {
          this.error.set('The server cannot be reached. Check that it is running and try again.');
        } else {
          this.error.set(err.status < 500 && err.error?.message ? err.error.message : 'The installation failed. See the server log for the details.');
        }
      },
    });
  }
}
