import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

import { FormGroup, FormBuilder, Validators, ValidatorFn, AbstractControl, FormControl } from '@angular/forms';
// TODO maybe auto authenticate
// import { AlertService, AuthenticationService } from '../services/index';

import { RegisterService } from './register.service';


export function equalityValidator(testing: String): ValidatorFn {
  return (control: AbstractControl): {[key: string]: any} | null => {
    const forbidden = testing === control.value;
    return forbidden ? {'confirmPassword': {value: control.value}} : null;
  };
}

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  private formSubmitAttempt: boolean;

  form: FormGroup;
  inProgress: boolean = true;

  constructor(private fb: FormBuilder, private service: RegisterService,
    private router: Router) {
    }

  ngOnInit() {
    // equalityValidator(this.form.value.password)
    this.form = this.fb.group({
      userName: ['', Validators.required],
      email: ['', Validators.required],
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required]
    });
  }

  isFieldInvalid(field: string) {
    this.inProgress = false;
    return (
      (!this.form.get(field).valid && this.form.get(field).touched) ||
      (this.form.get(field).untouched && this.formSubmitAttempt)
    );
  }

  onSubmit() {
    this.inProgress = true;
    if (this.form.valid) {
      this.service.register(
        this.form.value.email,
        this.form.value.userName,
        this.form.value.password,
        this.form.value.confirmPassword
      ).subscribe((data) => {
        this.inProgress = false;
      });
    }
    this.formSubmitAttempt = true;
  }
}
