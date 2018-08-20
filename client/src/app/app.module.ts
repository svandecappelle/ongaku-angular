import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { NgModule } from '@angular/core';

import 'moment-duration-format';

import { MaterialModule } from './modules/material.module';

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';  // replaces previous Http service

import { DragulaModule } from 'ng2-dragula';
import { MomentModule } from 'ngx-moment';
import { Ng2PageScrollModule } from 'ng2-page-scroll';
import { ChartsModule } from 'ng2-charts/ng2-charts';

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

import { AlertService, AuthenticationService, UserService } from './services/index';
import { AuthGuard } from './guards/index';
import { MetadatasComponent } from './metadatas/metadatas.component';
import { AdminComponent, StatisticsService } from './admin/';
import { SearchComponent } from './search/search.component';
import { ArtistComponent, ArtistService } from './artist';
import { AlbumComponent, AlbumService } from './artist/album/';
import { UsersComponent } from './users/users.component';
import { LibraryComponent } from './library/library.component';
import { RadiosComponent } from './radios/radios.component';

import { UsersService } from './users';
import { UploadService } from './upload';
import { UploadModule } from './upload/upload.module';
import { ReloadComponent } from './library/reload/reload.component';
import { ReloadService } from './library/reload.service';
import { CommunicationModule } from './communication/communication.module';


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
    DragulaModule,
    MomentModule,
    Ng2PageScrollModule,
    ChartsModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    AppRoutingModule,
    HttpClientModule,
    AppStateModule,
    PlayerModule,
    UploadModule,
    CommunicationModule
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
    UsersService,
    UploadService,
    InstallService,
    ReloadService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
