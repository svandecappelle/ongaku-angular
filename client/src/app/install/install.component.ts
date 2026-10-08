import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from '@angular/forms';

import { InstallService } from './install.service';

@Component({
    selector: 'app-install',
    templateUrl: './install.component.html',
    styleUrls: ['./install.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class InstallComponent implements OnInit {
  private formSubmitAttempt: boolean;

  form: UntypedFormGroup;
  loginInProgress: boolean;

  constructor(private ref: ChangeDetectorRef,
    private fb: UntypedFormBuilder,
    private router: Router,
    private installService: InstallService) { }

  ngOnInit() {
    this.form = this.fb.group({
      userName: ['', Validators.required],
      password: ['', Validators.required],
      email: ['', Validators.email]
    });
  }

  isFieldInvalid(field: string) {
    this.loginInProgress = false;
    return (
      (!this.form.get(field).valid && this.form.get(field).touched) ||
      (this.form.get(field).untouched && this.formSubmitAttempt)
    );
  }

  install() {
    this.loginInProgress = true;

    this.ref.markForCheck();
    if (this.form.valid) {
      this.installService.install({
        username: this.form.value.userName,
        password: this.form.value.password,
        email: this.form.value.email
      }).subscribe(() => {
        this.loginInProgress = false;
        this.router.navigate(['/login']);
      });

      this.loginInProgress = false;
    }
    this.formSubmitAttempt = true;
  }
}
