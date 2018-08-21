import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../modules/material.module';

import { UserService } from './user.service';
import { UserComponent } from './user.component';


@NgModule({
  imports: [
    CommonModule,
    MaterialModule
  ],
  exports: [
    UserComponent
  ],
  providers: [
    UserService
  ],
  declarations: [
    UserComponent
  ]
})
export class UserModule { }
