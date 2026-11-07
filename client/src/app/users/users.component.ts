import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../modules/material.module';
import { UsersService } from './users.service';
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

  readonly users = signal<User[] | null>(null);
  readonly failed = signal(false);
  readonly filter = signal('');
  readonly sort = signal<Sort>('name');
  readonly me = currentUsername();

  readonly visible = computed(() => {
    const filter = this.filter().trim().toLowerCase();
    const users = (this.users() ?? []).filter((user) => !filter || user.username.toLowerCase().includes(filter));
    return this.sort() === 'tracks' ? [...users].sort((a, b) => b.tracks - a.tracks) : users;
  });

  constructor() {
    this.load();
  }

  load() {
    this.failed.set(false);
    this.service.get().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.failed.set(true),
    });
  }
}

/** Username saved at login by AuthenticationService */
function currentUsername(): string | null {
  try {
    return JSON.parse(localStorage.getItem('currentUser') ?? 'null')?.username ?? null;
  } catch {
    return null;
  }
}
