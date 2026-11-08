import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../modules/material.module';

import { UserService } from './user.service';
import { UserComponent } from './user.component';


@NgModule({
  imports: [
    CommonModule,
    MaterialModule,
    UserComponent
  ],
  exports: [
    UserComponent
  ],
  providers: [
    UserService
  ]
})
export class UserModule { }
