import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { map } from 'rxjs/operators';

import { IAppState } from '../../app-state';
import { SearchLibraryAction } from '../../header/header-state';
import { MaterialModule } from '../../modules/material.module';
import { AuthenticationService } from '../../services/authentication.service';
import { LayoutService } from '../../services/layout.service';
import { ThemeService } from '../../services/theme.service';
import { PlayerBarComponent } from '../player-bar/player-bar.component';
import { QueuePanelComponent } from '../queue-panel/queue-panel.component';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  exact: boolean;
}

/** Frame of the new interface: side navigation, top bar, player bar and queue */
@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, RouterLinkActive, PlayerBarComponent, QueuePanelComponent],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class ShellComponent {
  readonly theme = inject(ThemeService);
  readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthenticationService);
  private readonly store = inject<Store<IAppState>>(Store);
  private readonly router = inject(Router);

  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  /** Labels are hidden and shown as tooltips on narrow screens */
  readonly compact = toSignal(
    inject(BreakpointObserver).observe('(max-width: 959px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  readonly queueOpen = signal(false);
  readonly searchValue = toSignal(this.store.select((state) => String(state.search ?? '')), { initialValue: '' });

  readonly nav: NavItem[] = [
    { label: 'Discover', icon: 'home', link: '/', exact: true },
    { label: 'My library', icon: 'library_music', link: '/my-library', exact: false },
    { label: 'Radios', icon: 'radio', link: '/radios', exact: false },
    { label: 'Users', icon: 'group', link: '/users', exact: false },
  ];

  search(criterion: string) {
    this.store.dispatch(new SearchLibraryAction(criterion.trim()));
    // The results are on the Discover page
    if (criterion.trim() && this.router.url.split('?')[0] !== '/') {
      this.router.navigate(['/']);
    }
  }

  logout() {
    this.auth.logout();
  }

  onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    const shortcut = (event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey));
    if (shortcut) {
      event.preventDefault();
      this.searchInput().nativeElement.focus();
    }
  }
}
