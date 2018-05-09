import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { NgModule } from '@angular/core';

import 'moment-duration-format';

import { MaterialModule } from './modules/material.module';

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';  // replaces previous Http service

import { DragulaModule } from 'ng2-dragula';

import { AppComponent } from './app.component';
import { HeaderComponent } from './header/header.component';
import { ContentComponent } from './content/content.component';
import { AppRoutingModule } from './app-routing.module';
import { HomeComponent } from './home/home.component';
import { InstallComponent } from './install/install.component';
import { UpgradeComponent } from './upgrade/upgrade.component';
import { MenuComponent } from './menu/menu.component';

import { AudioService } from './home/audio.service';
import { PlayerModule } from './player/player.module';   // our custom service, see below

import { AppStateModule } from './app-state';
import { PlayerControlsComponent } from './player/controls/player-controls/player-controls.component';
import { LoginComponent } from './login/login.component';

import { AlertService, AuthenticationService, UserService } from './services/index';
import { AuthGuard } from './guards/index';
import { MetadatasComponent } from './home/metadatas/metadatas.component';

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
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    DragulaModule,
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
    AudioService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
