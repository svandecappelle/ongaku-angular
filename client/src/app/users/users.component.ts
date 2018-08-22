import { Component, OnInit } from '@angular/core';

import { UsersService } from './users.service';
import { User } from './index';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {

  private users: User[];

  constructor(private service: UsersService) { }

  ngOnInit() {
    this.service.get().subscribe((users: User[]) => {
      this.users = users;
    });
  }

}
