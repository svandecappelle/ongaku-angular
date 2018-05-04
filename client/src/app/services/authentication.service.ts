import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';


import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map'

import {
    User
} from '../models/index'

@Injectable()
export class AuthenticationService {

    private loggedIn = new BehaviorSubject<boolean>(false); // {1}

    constructor(private http: HttpClient, private router : Router) { 
        this.http.get<any>('/api/auth').subscribe((data) => {
            this.loggedIn.next(data.connected);
        });
    }
    
    get isLoggedIn() {
        return this.loggedIn.asObservable(); // {2}
    }

    login(username: string, password: string) {
        return this.http.post<any>('/api/auth/login', { username: username, password: password }).subscribe((data) => {
            if (data.user){   
                let userConnected = new User();
                userConnected.id = data.user.uid;
                userConnected.username = username;
                localStorage.setItem('currentUser', JSON.stringify(userConnected));
                this.loggedIn.next(true);
                this.router.navigate(['/']);
            }
        }, error => {console.log(error)});
    }

    logout() {
        // remove user from local storage to log user out
        this.http.post('/api/auth/logout', {}).subscribe((disconnected) => {
            console.log(disconnected);
            localStorage.removeItem('currentUser');
            this.loggedIn.next(false);
            this.router.navigate(['/login']);
        });
    }
}