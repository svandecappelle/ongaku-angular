import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { Observable } from 'rxjs';
import { AuthenticationService } from './../services/authentication.service';
import { ThemeService } from './../services/theme.service';

@Component({
    selector: 'app-content',
    templateUrl: './content.component.html',
    styleUrls: ['./content.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ContentComponent implements OnInit {
  /** null while the session is not known yet */
  isLoggedIn$: Observable<boolean | null>;

  constructor(private authService: AuthenticationService, public themeService: ThemeService) { }

  ngOnInit() {
    this.isLoggedIn$ = this.authService.loginState();
  }

}
