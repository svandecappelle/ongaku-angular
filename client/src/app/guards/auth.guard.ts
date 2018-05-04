import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs/Observable';

import { AuthenticationService } from './../services/authentication.service';

@Injectable()
export class AuthGuard implements CanActivate {

    constructor(private router: Router, private authService: AuthenticationService) { 
        this.authService.isLoggedIn.subscribe((connected) => {
            console.log(connected);
            if (!connected) {
                localStorage.removeItem('currentUser');
                this.router.navigate(['/login']);
            } else {
                this.router.navigate(['/']);
            }
        })

    }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot):Observable<boolean>|boolean {
        return this.authService.isLoggedIn;
    }
}