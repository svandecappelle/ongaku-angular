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
import { MenuComponent } from './menu/menu.component';

import { AudioService } from './audio.service';
import { PlayerModule } from './player/player.module';   // our custom service, see below

import { AppStateModule } from './app-state';
import { PlayerControlsComponent } from './player/controls/player-controls/player-controls.component';
import { LoginComponent } from './login/login.component';

import { AlertService, AuthenticationService, UserService } from './services/index';
import { AuthGuard } from './guards/index';
import { MetadatasComponent } from './metadatas/metadatas.component';
import { AdminComponent } from './admin/admin.component';
import { SearchComponent } from './search/search.component';
import { ArtistComponent, ArtistService } from './artist';
import { AlbumComponent, AlbumService } from './artist/album/';

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
    AlbumComponent
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
    AlbumService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
