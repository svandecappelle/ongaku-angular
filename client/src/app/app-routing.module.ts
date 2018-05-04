import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/index';
import { AuthGuard } from './guards/index';

import { InstallComponent } from './install/install.component';
import { UpgradeComponent } from './upgrade/upgrade.component';

const routes: Routes = [
  { path: 'home', component: HomeComponent/*, canActivate: [AuthGuard] */},
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'install', component: InstallComponent },
  { path: 'upgrade', component: UpgradeComponent },
  
  { path: 'login', component: LoginComponent },
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(routes)
  ],
  declarations: [],
  exports: [ RouterModule ]
})
export class AppRoutingModule { }
