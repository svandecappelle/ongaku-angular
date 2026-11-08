import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../modules/material.module';
import { UsersService } from './users.service';
import { AuthenticationService } from '../services/authentication.service';
import { NowPlaying, PresenceService } from '../services/presence.service';
import { User } from './index';

type Sort = 'name' | 'tracks';

/** Members of the server: cards linking to their profile */
@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, RouterLink],
})
export class UsersComponent {
  private readonly service = inject(UsersService);
  readonly presence = inject(PresenceService);

  readonly users = signal<User[] | null>(null);
  readonly failed = signal(false);
  readonly filter = signal('');
  readonly sort = signal<Sort>('name');
  /** The connected user */
  readonly me = toSignal(inject(AuthenticationService).username(), { initialValue: null });

  /** Members online, live */
  readonly onlineCount = computed(() => (this.users() ?? []).filter((user) => this.presence.of(user.username).online).length);

  readonly visible = computed(() => {
    const filter = this.filter().trim().toLowerCase();
    const users = (this.users() ?? []).filter((user) => !filter || user.username.toLowerCase().includes(filter));
    return this.sort() === 'tracks' ? [...users].sort((a, b) => b.tracks - a.tracks) : users;
  });

  constructor() {
    this.load();
  }

  listenAlong(nowPlaying: NowPlaying) {
    this.presence.listenAlong(nowPlaying);
  }

  load() {
    this.failed.set(false);
    this.service.get().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.failed.set(true),
    });
  }
}
