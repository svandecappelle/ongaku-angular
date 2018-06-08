import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/index';
import { AuthGuard } from './guards/index';

import { InstallComponent } from './install/install.component';
import { UpgradeComponent } from './upgrade/upgrade.component';
import { AdminComponent } from './admin/admin.component';

import { ArtistComponent } from './artist/artist.component';

const routes: Routes = [
  { path: 'artist/:artist', component: ArtistComponent, canActivate: [AuthGuard]},
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },

  { path: 'install', component: InstallComponent },
  { path: 'upgrade', component: UpgradeComponent },

  { path: 'admin', component: AdminComponent },

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
