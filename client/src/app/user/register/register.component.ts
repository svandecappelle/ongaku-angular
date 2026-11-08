import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { AuthenticationService } from '../../services/authentication.service';
import { AuthCardComponent } from '../../auth-card/auth-card.component';

/** Same rules as the server (server/app/middleware/account-fields.js) */
export const USERNAME_PATTERN = /^[\w.-]+$/;
export const MIN_PASSWORD = 8;

/** The confirmation must repeat the password (error on the group: `mismatch`) */
export function samePasswords(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

/** Sign up page (/register), while the server accepts new accounts */
@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule, RouterLink, AuthCardComponent],
})
export class RegisterComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly router = inject(Router);

  readonly minPassword = MIN_PASSWORD;
  readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN), Validators.maxLength(40)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD)]],
    confirmPassword: ['', Validators.required],
  }, { validators: samePasswords });

  /** loading: asking the server whether sign up is open */
  readonly state = signal<'loading' | 'open' | 'closed'>('loading');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  constructor() {
    this.auth.registration().subscribe({
      next: (registration) => this.state.set(registration.open ? 'open' : 'closed'),
      error: () => this.state.set('closed'),
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
    const fields = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.auth.register({ ...fields, username: fields.username.trim(), email: fields.email.trim() }).subscribe({
      next: () => this.router.navigate(['/']),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 403) {
          this.state.set('closed');
        } else if (err.status === 0) {
          this.error.set('The server cannot be reached. Check your connection and try again.');
        } else {
          this.error.set(err.status < 500 && err.error?.message ? err.error.message : 'The account could not be created. Please try again.');
        }
      },
    });
  }
}
