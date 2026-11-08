import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Frame of the pages shown before signing in (login, sign up, installation): the whole
 * screen, a slow glow in the accent colour, and a card with the logo, a title and the
 * projected content. The form parts are styled by the pages with the `auth-form` mixin.
 */
@Component({
  selector: 'app-auth-card',
  templateUrl: './auth-card.component.html',
  styleUrls: ['./auth-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCardComponent {
  readonly heading = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** The note of the logo beats while something is in progress */
  readonly busy = input(false);
  /** Wider card, for longer forms */
  readonly wide = input(false);
}
