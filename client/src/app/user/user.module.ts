import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../modules/material.module';

import { UserService } from './user.service';
import { UserComponent } from './user.component';
import { RegisterModule } from './register/register.module';


@NgModule({
  imports: [
    CommonModule,
    MaterialModule,
    RegisterModule
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
