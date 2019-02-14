const socketio = require('socket.io');

let instance = null;

class Communication {

	constructor() {
		if (!instance) {
			instance = this;
		}
		return instance;
	}

	start(service) {
		this.statuses = {};
		this.io = require('socket.io')(service);
		this.io.on('connection', (socket) => {
			var address = socket.handshake.address;
			var userAgent = socket.client.request.headers['user-agent'];
			console.info(`User ${address} connected to communication system on ${userAgent}`);

			socket.emit('connected');

			socket.on('room:join', (data) => {
				console.info(`joining room: ${data}`);
				socket.join(data);
			});

			socket.on('status:change', (data) => {
				console.log(`status of ${data.user} changed to ${data.status}`);
				this.statuses[data.user] = data.status;
				this.broadcast('status:change', data);
			});
			socket.on('chat:message', (data) => {
				this.emit(data.to, 'chat:message', data);
			});
		});
	}

	broadcast(event, data) {
		if (this.io) {
			this.io.sockets.emit(event, data);
		}
	}

	emit(room, event, data) {
		if (data && data.message) {
			console.info(`emit to room: ${room}`, event, data.message);
		}
		this.io.to(room).emit(event, data);
	}

	status(username) {
		return this.statuses[username] ? this.statuses[username] : 'offline';
	}

	setStatus(username, status) {
		this.statuses[username] = status;
	}
}

module.exports = new Communication();
