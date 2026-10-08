import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthenticationService } from './../services/authentication.service';

@Injectable()
export class AuthGuard  {

    constructor(private router: Router, private authService: AuthenticationService) {}

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean>|boolean {
        this.authService.isLoggedIn().subscribe((connected) => {
            if (!connected) {
                this.router.navigate(['login']);
            }
        });
        return this.authService.isLoggedIn();
    }
}