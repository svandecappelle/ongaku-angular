import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { NgModule } from '@angular/core';

import 'moment-duration-format';

import { MaterialModule } from './modules/material.module';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';  // replaces previous Http service

import { DragulaModule } from 'ng2-dragula';
import { MomentModule } from 'ngx-moment';

import { AppComponent } from './app.component';
import { HeaderComponent } from './header/header.component';
import { ContentComponent } from './content/content.component';
import { AppRoutingModule } from './app-routing.module';
import { HomeComponent } from './home/home.component';
import { InstallComponent } from './install/install.component';
import { UpgradeComponent } from './upgrade/upgrade.component';

import { InstallService } from './install/install.service';
import { MenuComponent } from './menu/menu.component';

import { AudioService } from './audio.service';
import { PlayerModule } from './player/player.module';   // our custom service, see below

import { AppStateModule } from './app-state';
import { LoginComponent } from './login/login.component';

import {
  AlertService,
  AuthenticationService,
  UserService,
  StatisticsService,
  AdminService,
  AlbumService,
  ArtistService,
  MetadataService
} from './services';
import { AuthGuard } from './guards/index';

// import { EditMetadataComponent } from './metadatas/edit-metadata/edit-metadata.component';
import { MetadatasComponent } from './metadatas/metadatas.component';
import { AdminComponent } from './admin/';
import { SearchComponent } from './search/search.component';
import { ArtistComponent } from './artist';
import { AlbumComponent } from './artist/album/';
import { UsersComponent } from './users/users.component';
import { LibraryComponent } from './library/library.component';
import { RadiosComponent } from './radios/radios.component';

import { UsersService } from './users';
import { UploadService } from './upload';
import { UploadModule } from './upload/upload.module';
import { ReloadComponent } from './library/reload/reload.component';
import { ReloadService } from './library/reload.service';
import { CommunicationModule } from './communication/communication.module';
import { UserModule } from './user/user.module';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    ContentComponent,
    HomeComponent,
    InstallComponent,
    UpgradeComponent,
    MenuComponent,
    LoginComponent,
    MetadatasComponent,
    AdminComponent,
    SearchComponent,
    ArtistComponent,
    AlbumComponent,
    UsersComponent,
    LibraryComponent,
    RadiosComponent,
    ReloadComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    DragulaModule.forRoot(),
    MomentModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    AppRoutingModule,
    HttpClientModule,
    AppStateModule,
    PlayerModule,
    UploadModule,
    CommunicationModule,
    UserModule
  ],
  entryComponents: [
    MetadatasComponent
  ],
  providers: [
    AuthGuard,
    AlertService,
    AuthenticationService,
    UserService,
    AudioService,
    ArtistService,
    AlbumService,
    StatisticsService,
    AdminService,
    UsersService,
    MetadataService,
    UploadService,
    InstallService,
    ReloadService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
