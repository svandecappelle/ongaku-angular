import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';

/** Album cover linking to the album page, with a play button */
@Component({
  selector: 'app-album-card',
  templateUrl: './album-card.component.html',
  styleUrls: ['./album-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
})
export class AlbumCardComponent {
  readonly name = input.required<string>();
  readonly cover = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly play = output<void>();
}
