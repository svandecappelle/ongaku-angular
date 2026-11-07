import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MaterialModule } from '../modules/material.module';

export type UserDialogData = { mode: 'create' } | { mode: 'password'; username: string };

export interface UserDialogResult {
  username: string;
  email: string;
  password: string;
  administrator: boolean;
}

const sameAsPassword = (control: AbstractControl): ValidationErrors | null =>
  control.parent && control.value !== control.parent.get('password')?.value ? { mismatch: true } : null;

/** Creates an account, or changes the password of one (mode "password") */
@Component({
  selector: 'app-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Add a user' : 'Change the password of ' + data.username }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="fields">
        @if (data.mode === 'create') {
          <mat-form-field>
            <mat-label>Username</mat-label>
            <input matInput formControlName="username" autocomplete="off" cdkFocusInitial>
            @if (form.controls.username.hasError('pattern')) {
              <mat-error>Letters, digits, dots, dashes and underscores only</mat-error>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>E-mail</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="off">
            @if (form.controls.email.hasError('email')) {
              <mat-error>Invalid e-mail address</mat-error>
            }
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password">
          @if (form.controls.password.hasError('minlength')) {
            <mat-error>At least 8 characters</mat-error>
          }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Confirm the password</mat-label>
          <input matInput type="password" formControlName="confirm" autocomplete="new-password">
          @if (form.controls.confirm.hasError('mismatch')) {
            <mat-error>The passwords differ</mat-error>
          }
        </mat-form-field>
        @if (data.mode === 'create') {
          <mat-checkbox formControlName="administrator">Administrator</mat-checkbox>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid">{{ data.mode === 'create' ? 'Create' : 'Change' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .fields {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
    }
  `],
})
export class UserDialogComponent {
  readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<UserDialogComponent, UserDialogResult>>(MatDialogRef);
  private readonly creating = this.data.mode === 'create';

  readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', this.creating ? [Validators.required, Validators.pattern(/^[\w.-]+$/)] : []],
    email: ['', this.creating ? [Validators.required, Validators.email] : []],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required, sameAsPassword]],
    administrator: [false],
  });

  constructor() {
    // The confirmation is checked again when the password changes
    this.form.controls.password.valueChanges.subscribe(() => this.form.controls.confirm.updateValueAndValidity());
  }

  submit() {
    if (this.form.valid) {
      const { username, email, password, administrator } = this.form.getRawValue();
      this.dialogRef.close({ username: username.trim(), email: email.trim(), password, administrator });
    }
  }
}
