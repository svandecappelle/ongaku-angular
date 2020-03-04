import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';


import { BehaviorSubject ,  Observable } from 'rxjs';


import {
    User
} from '../models/index';

@Injectable()
export class AuthenticationService {

    private loggedIn = new BehaviorSubject<boolean>(true); // {1}

    constructor(private http: HttpClient, private router: Router) {
        this.http.get<any>('/api/auth').subscribe((data) => {
            this.loggedIn.next(data.connected);
        });
    }

    isLoggedIn(): Observable<boolean> {
        return this.loggedIn; // {2}
    }

    login(username: string, password: string, rememberme: boolean) {
        return this.http.post<any>('/api/auth/login', {
            username: username,
            password: password,
            remember: rememberme ? 'on' : 'off'
        }).subscribe((data) => {
            if (data.user) {
                const userConnected = new User();
                userConnected.id = data.user.uid;
                userConnected.username = username;
                localStorage.setItem('currentUser', JSON.stringify(userConnected));
                this.loggedIn.next(true);
                this.router.navigate(['/']);
            }
        }, error => { console.error(error); });
    }

    logout() {
        // remove user from local storage to log user out
        this.http.post('/api/auth/logout', {}).subscribe((disconnected) => {
            localStorage.removeItem('currentUser');
            this.loggedIn.next(false);
            this.router.navigate(['/login']);
        });
    }
}