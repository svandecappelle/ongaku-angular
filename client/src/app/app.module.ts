import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { NgModule } from '@angular/core';

import 'moment-duration-format';

import { MaterialModule } from './modules/material.module';

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';  // replaces previous Http service

import { AppComponent } from './app.component';
import { HeaderComponent } from './header/header.component';
import { ContentComponent } from './content/content.component';
import { AppRoutingModule } from './app-routing.module';
import { DashboardComponent } from './dashboard/dashboard.component';
import { InstallComponent } from './install/install.component';
import { UpgradeComponent } from './upgrade/upgrade.component';
import { MenuComponent } from './menu/menu.component';

import { AudioService } from './dashboard/audio.service';
import { PlayerModule } from './player/player.module';   // our custom service, see below

import { AppStateModule } from './app-state';
import { PlayerControlsComponent } from './player/controls/player-controls/player-controls.component';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    ContentComponent,
    DashboardComponent,
    InstallComponent,
    UpgradeComponent,
    MenuComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    AppRoutingModule,
    HttpClientModule,
    AppStateModule,
    PlayerModule,
  ],
  providers: [AudioService],
  bootstrap: [AppComponent]
})
export class AppModule { }
