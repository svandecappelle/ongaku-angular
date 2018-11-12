import { Component, OnInit } from '@angular/core';
import { NotificationsService } from './notifications.service';
import { Event } from '../model/event';
import { Message } from '../model/message';
import { User } from '../model/user';


@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent implements OnInit {

  user: User;
  messages: Message[] = [];
  messageContent: string;
  ioConnection: any;

  scanProgressValue: number = 0;
  scanMessage: Message;

  constructor(private service: NotificationsService) { }

  ngOnInit() {
    this.service.initSocket();

    this.ioConnection = this.service.onMessage()
      .subscribe((message: Message) => {
        this.messages.push(message);
      });

    this.service.onEvent(Event.CONNECT)
      .subscribe(() => {});

    this.service.onEvent(Event.DISCONNECT)
      .subscribe(() => {});

    this.service.onEvent(Event.LIBRARY_SCAN).subscribe((data) => {
      this.scanProgressValue = data.value;
      if (data.value === 100) {
        this.scanMessage = new Message(new User('System'), `Scan finished`);
        setTimeout(() => {
          this.scanMessage = null;
          this.scanProgressValue = 0;
        }, 8000);
      } else {
        let value = Math.round(data.value * 100);
        value = value / 100;
        this.scanMessage = new Message(new User('System'), `${data.content}: ${value}%`); 
      }
    });
  }

  close(notification) {
    this.messages.splice(this.messages.lastIndexOf(notification), 1);
  }
}
