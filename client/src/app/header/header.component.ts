import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthenticationService } from './../services/authentication.service';

import {
  SearchLibraryAction
} from './header-state';

import {
  IAppState
} from '../app-state';

import { Store, Action, select } from '@ngrx/store';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  isLoggedIn$: Observable<boolean>;

  constructor(private authService: AuthenticationService, private store: Store<IAppState>) { }

  ngOnInit() {
    this.isLoggedIn$ = this.authService.isLoggedIn();
  }

  onLogout() {
    this.authService.logout();
  }

  search(criterion: String) {
    this.store.dispatch(new SearchLibraryAction(criterion));
  }
}
