import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes, ExtraOptions } from '@angular/router';

import { LoginComponent } from './login/index';
import { AuthGuard } from './guards/index';

import { InstallComponent } from './install/install.component';
import { UpgradeComponent } from './upgrade/upgrade.component';
import { AdminComponent } from './admin/admin.component';

import { UsersComponent } from './users/users.component';
import { RadiosComponent } from './radios/radios.component';
import { LibraryComponent } from './library/library.component';
import { ReloadComponent } from './library/reload/reload.component';
import { UserComponent } from './user/user.component';
import { AppearanceComponent } from './user/appearance/appearance.component';
import { ThemeEditorComponent } from './theme/theme-editor/theme-editor.component';
import { RegisterComponent } from './user/register/register.component';

const routes: Routes = [
  { path: 'artist/:artist', canActivate: [AuthGuard],
    loadComponent: () => import('./v3/artist-page/artist-page.component').then((m) => m.ArtistPageComponent) },
  { path: 'album/:artist/:album', canActivate: [AuthGuard],
    loadComponent: () => import('./v3/album-page/album-page.component').then((m) => m.AlbumPageComponent) },
  // Former links, giving only the title
  { path: 'album/:album', canActivate: [AuthGuard],
    loadComponent: () => import('./v3/album-page/album-page.component').then((m) => m.AlbumPageComponent) },
  { path: 'playlists', canActivate: [AuthGuard],
    loadComponent: () => import('./v3/playlists-page/playlists-page.component').then((m) => m.PlaylistsPageComponent) },
  { path: 'playlists/:name', canActivate: [AuthGuard],
    loadComponent: () => import('./v3/playlist-page/playlist-page.component').then((m) => m.PlaylistPageComponent) },
  { path: 'users', component: UsersComponent, canActivate: [AuthGuard]},
  { path: 'radios', component: RadiosComponent, canActivate: [AuthGuard]},
  { path: 'my-library/:folder', component: LibraryComponent, canActivate: [AuthGuard]},
  { path: 'my-library', component: LibraryComponent, canActivate: [AuthGuard]},
  // The uploads are a tab of My library
  { path: 'upload', redirectTo: '/my-library?tab=uploads' },
  { path: 'reload', component: ReloadComponent, canActivate: [AuthGuard] },
  { path: 'profile', component: UserComponent, canActivate: [AuthGuard] },
  { path: 'profile/appearance', component: AppearanceComponent, canActivate: [AuthGuard] },
  { path: 'profile/appearance/themes/new', component: ThemeEditorComponent, canActivate: [AuthGuard] },
  { path: 'profile/appearance/themes/:id', component: ThemeEditorComponent, canActivate: [AuthGuard] },
  { path: 'profile/:user', component: UserComponent, canActivate: [AuthGuard] },
  { path: '', canActivate: [AuthGuard],
    loadComponent: () => import('./v3/discover-page/discover-page.component').then((m) => m.DiscoverPageComponent) },

  { path: 'install', component: InstallComponent },
  { path: 'upgrade', component: UpgradeComponent, canActivate: [AuthGuard] },

  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard] },

  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
];

const routerOptions: ExtraOptions = {
  useHash: false,
  anchorScrolling: 'enabled',
  scrollPositionRestoration: 'enabled'
};

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(routes, routerOptions)
  ],
  declarations: [],
  exports: [ RouterModule ]
})
export class AppRoutingModule { }
