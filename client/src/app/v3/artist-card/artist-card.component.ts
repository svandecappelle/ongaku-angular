import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';

/** Round artist picture linking to the artist page */
@Component({
  selector: 'app-artist-card',
  templateUrl: './artist-card.component.html',
  styleUrls: ['./artist-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
})
export class ArtistCardComponent {
  readonly name = input.required<string>();
  /** Candidate images, tried in order */
  readonly images = input<string[]>([]);

  readonly imageIndex = linkedSignal({ source: this.images, computation: () => 0 });
  readonly image = computed(() => this.images()[this.imageIndex()] ?? null);
}
