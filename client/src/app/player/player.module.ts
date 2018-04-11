import { NgModule } from '@angular/core';

import { PlayerComponent } from './player.component';
import { PlayerControlsComponent } from './controls/player-controls/player-controls.component';

import { MaterialModule } from '../modules/material.module';

import { AudioService } from './player.service';

@NgModule({
    declarations: [
      // components
      PlayerComponent,
      PlayerControlsComponent,
    ],
    imports: [
      MaterialModule,
    ],
    exports: [
      PlayerComponent
    ],
    providers: [
      AudioService
    ]
  })
  export class PlayerModule {}
  