import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { AlertService, AuthenticationService } from '../services/index';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
    form: FormGroup;                    // {1}
    private formSubmitAttempt: boolean; // {2}
    private loginInProgress: boolean;

    constructor(
      private ref: ChangeDetectorRef,
      private fb: FormBuilder,         // {3}
      private authService: AuthenticationService // {4}
    ) {}
  
    ngOnInit() {
      this.form = this.fb.group({     // {5}
        userName: ['', Validators.required],
        password: ['', Validators.required]
      });
    }
  
    isFieldInvalid(field: string) { // {6}
      this.loginInProgress = false;
      return (
        (!this.form.get(field).valid && this.form.get(field).touched) ||
        (this.form.get(field).untouched && this.formSubmitAttempt)
      );
    }
  
    onSubmit() {      
      this.loginInProgress = true;
      this.ref.markForCheck();
      if (this.form.valid) {
        this.authService.login(this.form.value.userName, this.form.value.password); // {7}
        this.loginInProgress = false;
      }
      this.formSubmitAttempt = true;             // {8}
    }
  }
  
