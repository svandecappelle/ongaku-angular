import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { AuthCardComponent } from '../../auth-card/auth-card.component';
import { MIN_PASSWORD, samePasswords } from '../register/register.component';

/**
 * Page of a password reset link (/reset/:token) made by an administrator: a new password for
 * the account of the link, once. The sessions opened with the old password end.
 */
@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['../register/register.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule, RouterLink, AuthCardComponent],
})
export class ResetPasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly minPassword = MIN_PASSWORD;
  readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD)]],
    confirmPassword: ['', Validators.required],
  }, { validators: samePasswords });

  readonly state = signal<'loading' | 'ready' | 'invalid' | 'done'>('loading');
  readonly username = signal('');
  readonly problem = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);

  constructor() {
    this.http.get<{ username: string }>(`/api/auth/reset/${encodeURIComponent(this.token)}`).subscribe({
      next: ({ username }) => {
        this.username.set(username);
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => this.refuse(err),
    });
  }

  private refuse(err: HttpErrorResponse) {
    this.problem.set(err.status === 0 ? 'The server cannot be reached' : err.error?.message || 'This reset link cannot be used');
    this.state.set('invalid');
  }

  submit() {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.http.post(`/api/auth/reset/${encodeURIComponent(this.token)}`, this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.state.set('done');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 404) {
          this.refuse(err);
        } else {
          this.error.set(err.status < 500 && err.error?.message ? err.error.message : 'The password could not be changed. Please try again.');
        }
      },
    });
  }

  signIn() {
    this.router.navigate(['/login'], { queryParams: { username: this.username() } });
  }
}
