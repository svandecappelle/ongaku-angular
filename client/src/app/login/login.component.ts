import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { take } from 'rxjs/operators';

import { MaterialModule } from '../modules/material.module';
import { AuthenticationService } from '../services/authentication.service';
import { InstallService } from '../install/install.service';
import { AuthCardComponent } from '../auth-card/auth-card.component';

/** Why the sign-in failed, from the answer of /api/auth/login */
function failureMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Signing in failed. Please try again.';
  }
  if (err.status === 0) {
    return 'The server cannot be reached. Check your connection and try again.';
  }
  const text = JSON.stringify(err.error ?? '');
  if (text.includes('account-locked')) {
    return 'Too many failed attempts: the account is locked for a few minutes.';
  }
  if (text.includes('user-banned')) {
    return 'This account is disabled. Contact an administrator.';
  }
  if (err.status === 403 || err.status === 401 || text.includes('invalid-user-data')) {
    // The same message for an unknown user and a wrong password
    return 'Wrong user name or password.';
  }
  return 'Signing in failed. Please try again.';
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule, RouterLink, AuthCardComponent],
})
export class LoginComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(NonNullableFormBuilder).group({
    userName: ['', Validators.required],
    password: ['', Validators.required],
    rememberme: [true],
  });
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  /** The link to the sign up page only shows while it is open */
  readonly registrationOpen = signal(false);
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  constructor() {
    // Already connected: nothing to do here
    this.auth.isLoggedIn().pipe(take(1)).subscribe((connected) => {
      if (connected) {
        this.router.navigateByUrl(this.returnUrl());
      }
    });
    this.auth.registration().subscribe({
      next: (state) => this.registrationOpen.set(state.open),
      error: () => this.registrationOpen.set(false),
    });
    // A new server goes to the installation first
    inject(InstallService).check().subscribe((result) => {
      if (!result.version) {
        this.router.navigate(['/install']);
      }
    });
  }

  submit() {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { userName, password, rememberme } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.auth.login(userName.trim(), password, rememberme).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: (err) => {
        this.submitting.set(false);
        this.error.set(failureMessage(err));
        // Kept, and selected to type it again
        this.passwordInput()?.nativeElement.select();
      },
    });
  }

  /** The page asked for before the login, when it is a page of this site */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
    return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : '/';
  }
}
