import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';

import { AuthenticationService } from './../services/authentication.service';

/** Pages for connected users: waits until the session is known, sends the others to the login page */
@Injectable()
export class AuthGuard {
    constructor(private router: Router, private authService: AuthenticationService) {}

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
        return this.authService.isLoggedIn().pipe(
            take(1),
            // Back to the page asked for once connected
            map((connected) => connected || this.router.createUrlTree(['login'],
                state.url && state.url !== '/' ? { queryParams: { returnUrl: state.url } } : {})),
        );
    }
}
