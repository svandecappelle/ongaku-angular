import { NgModule } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { DragulaModule } from 'ng2-dragula';

import { PlayerComponent } from './player.component';
import { PlayerControlsComponent } from './controls/player-controls/player-controls.component';

import { MaterialModule } from '../modules/material.module';

import { AudioService } from './player.service';
import { PlayerActions } from './player-actions';
import { PlaylistService } from './controls/playlist/playlist.service';

import { PlaylistComponent, PlaylistDialogComponent } from './controls/playlist/';

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
      BrowserModule,
      DragulaModule
    ],
    exports: [
      PlayerComponent
    ],
    providers: [
      AudioService,
      PlaylistService,
      PlayerActions
    ]
  })
  export class PlayerModule {}
  