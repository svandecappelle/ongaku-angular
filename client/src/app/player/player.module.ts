import { NgModule } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';

import { PlayerComponent } from './player.component';
import { PlayerControlsComponent } from './controls/player-controls/player-controls.component';

import { MaterialModule } from '../modules/material.module';

import { AudioService } from './player.service';
import { PlayerActions } from './player-actions';

import { PlaylistComponent, PlaylistDialogComponent } from './controls/playlist/playlist.component';

@NgModule({
    declarations: [
      // components
      PlayerComponent,
      PlayerControlsComponent,
      PlaylistComponent,
      PlaylistDialogComponent
    ],
    entryComponents: [
      PlaylistDialogComponent
    ],
    imports: [
      MaterialModule,
      BrowserModule
    ],
    exports: [
      PlayerComponent
    ],
    providers: [
      AudioService,
      PlayerActions
    ]
  })
  export class PlayerModule {}
  