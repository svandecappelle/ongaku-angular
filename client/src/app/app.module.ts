import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';

import 'moment-duration-format';

import { MaterialModule } from './modules/material.module';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';  // replaces previous Http service

import { MomentModule } from 'ngx-moment';

import { AppComponent } from './app.component';
import { ThemeService } from './services/theme.service';
import { CoverAccentService } from './services/cover-accent.service';
import { ContentComponent } from './content/content.component';
import { AppRoutingModule } from './app-routing.module';
import { UpgradeComponent } from './upgrade/upgrade.component';

import { InstallService } from './install/install.service';


import { AppStateModule } from './app-state';

import {
  AlertService,
  AuthenticationService,
  UserService,
  StatisticsService,
  AdminService,
  MetadataService
} from './services';
import { AuthGuard } from './guards/index';

// import { EditMetadataComponent } from './metadatas/edit-metadata/edit-metadata.component';
import { MetadatasComponent } from './metadatas/metadatas.component';

import { UsersService } from './users';
import { ReloadComponent } from './library/reload/reload.component';
import { ReloadService } from './library/reload.service';
import { CommunicationModule } from './communication/communication.module';
import { UserModule } from './user/user.module';
import { ShellComponent } from './v3/shell/shell.component';

@NgModule({ declarations: [
        AppComponent,
        ContentComponent,
        UpgradeComponent,
        MetadatasComponent,
        ReloadComponent
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        BrowserAnimationsModule,
        MomentModule,
        FormsModule,
        ReactiveFormsModule,
        MaterialModule,
        AppRoutingModule,
        AppStateModule,
        CommunicationModule,
        UserModule,
        ShellComponent], providers: [
        AuthGuard,
        { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic', color: 'accent' } },
        AlertService,
        AuthenticationService,
        UserService,
        StatisticsService,
        AdminService,
        UsersService,
        MetadataService,
        InstallService,
        ReloadService,
        provideHttpClient(withXhr(), withInterceptorsFromDi()),
        // Apply the saved theme on startup, before any component renders (login page included)
        provideAppInitializer(() => { inject(ThemeService); inject(CoverAccentService); })
    ] })
export class AppModule { }
