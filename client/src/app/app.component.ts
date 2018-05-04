import { Component } from '@angular/core';

import { UserService } from './services/user.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'app';

  private isConnected: boolean;

  constructor(private userService: UserService){
    userService.isConnected().subscribe((connection) => {
      this.isConnected = true;
    });
  }
}
