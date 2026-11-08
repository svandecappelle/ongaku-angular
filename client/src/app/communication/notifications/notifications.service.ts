import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Message } from '../model/message';
import { Event } from '../model/event';
import { SocketService } from '../../services/socket.service';

@Injectable()
export class NotificationsService {

  private readonly sockets = inject(SocketService);
  private socket;

  public initSocket(): void {
    this.socket = this.sockets.socket;
  }

  public send(message: Message): void {
    this.socket.emit('message', message);
  }

  public onMessage(): Observable<Message> {
    return new Observable<Message>(observer => {
      this.socket.on('message', (data: Message) => observer.next(data));
    });
  }

  public onEvent(event: Event): Observable<any> {
    return new Observable<Event>(observer => {
      this.socket.on(event, (data: any) => observer.next(data));
    });
  }
}
