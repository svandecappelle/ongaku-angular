import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { Observable } from 'rxjs';
import { AuthenticationService } from './../services/authentication.service';

@Component({
    selector: 'app-content',
    templateUrl: './content.component.html',
    styleUrls: ['./content.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ContentComponent implements OnInit {
  isLoggedIn$: Observable<boolean>;

  constructor(private authService: AuthenticationService) { }

  ngOnInit() {
    this.isLoggedIn$ = this.authService.isLoggedIn(); // {2}
  }

}
