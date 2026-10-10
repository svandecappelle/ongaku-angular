import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MaterialModule } from '../../modules/material.module';
import { TrackActions } from '../track-list/track-actions.service';

/** Floating bar with the actions on the selected tracks of the page */
@Component({
  selector: 'app-selection-bar',
  templateUrl: './selection-bar.component.html',
  styleUrls: ['./selection-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  host: {
    '(document:keydown.escape)': 'actions.clear()',
  },
})
export class SelectionBarComponent {
  readonly actions = inject(TrackActions);
}
