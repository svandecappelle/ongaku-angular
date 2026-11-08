import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { BehaviorSubject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { User } from 'app/models/index';

@Injectable()
export class AuthenticationService {

    /** null until /api/auth answers */
    private loggedIn = new BehaviorSubject<boolean | null>(null);
    // Hides the administration links; the server checks the rights on every admin request
    private administrator = new BehaviorSubject<boolean>(false);
    private user = new BehaviorSubject<string | null>(null);

    constructor(private http: HttpClient, private router: Router) {
        this.refresh();
    }

    /** Whether a user is connected, once known */
    isLoggedIn(): Observable<boolean> {
        return this.loggedIn.pipe(filter((connected): connected is boolean => connected !== null));
    }

    /** Whether a user is connected; null while the server has not answered yet */
    loginState(): Observable<boolean | null> {
        return this.loggedIn;
    }

    isAdministrator(): Observable<boolean> {
        return this.administrator;
    }

    /** Username of the connected user, null when not connected */
    username(): Observable<string | null> {
        return this.user;
    }

    private refresh() {
        this.http.get<any>('/api/auth').subscribe({
            next: (data) => {
                this.loggedIn.next(!!data.connected);
                this.administrator.next(!!data.administrator);
                this.user.next(data.connected ? data.username ?? null : null);
            },
            // Server unreachable: the login page shows, and tells it when signing in
            error: () => this.loggedIn.next(false),
        });
    }

    /**
     * Signs in; completes once connected, errors with the HTTP error otherwise
     * (403: wrong user name or password, locked or banned account). The caller navigates.
     */
    login(username: string, password: string, rememberme: boolean): Observable<void> {
        return this.http.post<any>('/api/auth/login', {
            username: username,
            password: password,
            remember: rememberme ? 'on' : 'off'
        }).pipe(map((data) => {
            if (!data?.user) {
                throw new Error('Not connected');
            }
            const userConnected = new User();
            userConnected.id = data.user.uid;
            userConnected.username = username;
            localStorage.setItem('currentUser', JSON.stringify(userConnected));
            this.loggedIn.next(true);
            this.administrator.next(!!data.user.administrator);
            // The login may be the e-mail: the username comes from the server
            this.refresh();
        }));
    }

    logout() {
        // remove user from local storage to log user out
        this.http.post('/api/auth/logout', {}).subscribe((disconnected) => {
            localStorage.removeItem('currentUser');
            this.loggedIn.next(false);
            this.administrator.next(false);
            this.user.next(null);
            this.router.navigate(['/login']);
        });
    }
}