import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { Observable } from 'rxjs';
import { AuthenticationService } from './../services/authentication.service';
import { ThemeService } from './../services/theme.service';
import { LayoutService } from './../services/layout.service';

@Component({
    selector: 'app-content',
    templateUrl: './content.component.html',
    styleUrls: ['./content.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ContentComponent implements OnInit {
  isLoggedIn$: Observable<boolean>;

  constructor(private authService: AuthenticationService, public themeService: ThemeService, public layout: LayoutService) { }

  ngOnInit() {
    this.isLoggedIn$ = this.authService.isLoggedIn(); // {2}
  }

}
