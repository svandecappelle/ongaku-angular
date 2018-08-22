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
import { AlbumComponent } from './artist/album/album.component';
import { UsersComponent } from './users/users.component';
import { RadiosComponent } from './radios/radios.component';
import { LibraryComponent } from './library/library.component';
import { UploadComponent } from './upload/upload.component';
import { ReloadComponent } from './library/reload/reload.component';
import { UserComponent } from './user/user.component';
import { RegisterComponent } from './user/register/register.component';

const routes: Routes = [
  { path: 'artist/:artist', component: ArtistComponent, canActivate: [AuthGuard]},
  { path: 'album/:album', component: AlbumComponent, canActivate: [AuthGuard]},
  { path: 'users', component: UsersComponent, canActivate: [AuthGuard]},
  { path: 'radios', component: RadiosComponent, canActivate: [AuthGuard]},
  { path: 'my-library/:folder', component: LibraryComponent, canActivate: [AuthGuard]},
  { path: 'my-library', component: LibraryComponent, canActivate: [AuthGuard]},
  { path: 'upload', component: UploadComponent, canActivate: [AuthGuard]},
  { path: 'reload', component: ReloadComponent, canActivate: [AuthGuard] },
  { path: 'profile', component: UserComponent, canActivate: [AuthGuard] },
  { path: 'profile/:user', component: UserComponent, canActivate: [AuthGuard] },
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },

  { path: 'install', component: InstallComponent },
  { path: 'upgrade', component: UpgradeComponent, canActivate: [AuthGuard] },

  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard] },

  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
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
