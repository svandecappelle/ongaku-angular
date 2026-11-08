import { Injectable } from '@angular/core';
import { Socket, io } from 'socket.io-client';

/**
 * The Socket.io connection of the page, shared by the notifications and the presence.
 * The server knows its user from the session cookie sent on the handshake.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private connection: Socket | null = null;

  get socket(): Socket {
    if (!this.connection) {
      this.connection = io();
    }
    return this.connection;
  }

  /** New handshake, after a login or a logout: the server reads the session again */
  reconnect() {
    this.socket.disconnect();
    this.socket.connect();
  }
}
