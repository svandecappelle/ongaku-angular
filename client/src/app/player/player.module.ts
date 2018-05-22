import { NgModule, Pipe, PipeTransform } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { DragulaModule } from 'ng2-dragula';
import { MomentModule } from 'ngx-moment';

import * as moment from 'moment';
import 'moment-duration-format';

import { PlayerComponent } from './player.component';
import { PlayerControlsComponent } from './controls/player-controls/player-controls.component';

import { MaterialModule } from '../modules/material.module';

import { AudioService } from './player.service';
import { PlayerActions } from './player-actions';
import { PlaylistService } from './controls/playlist/playlist.service';

import { PlaylistComponent, PlaylistDialogComponent } from './controls/playlist/';

@Pipe({
  name: 'duration'
})
class DurationPipe implements PipeTransform {
  transform(value: string, fallback: string): string {
    const result: string = moment.duration(value, 'seconds').format('mm:ss');
    return result;
  }
}

@NgModule({
    declarations: [
      // components
      PlayerComponent,
      PlayerControlsComponent,
      PlaylistComponent,
      PlaylistDialogComponent,
      DurationPipe
    ],
    entryComponents: [
      PlaylistDialogComponent
    ],
    imports: [
      MaterialModule,
      BrowserModule,
      DragulaModule,
      MomentModule
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
