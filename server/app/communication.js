const socketio = require('socket.io');

let instance = null;

/**
 * Socket.io server. The sockets read the session of the page (the express-session
 * middleware runs on their handshake), so the user of a socket is known by the server,
 * never declared by the client.
 *
 * Presence: a user is online while at least one of his tabs is connected; the player of
 * each tab sends what it plays ("now-playing"), which the other members receive
 * ("presence:update") unless the user hides it.
 */
class Communication {

	constructor() {
		if (!instance) {
			instance = this;
		}
		return instance;
	}

	start(service, sessionMiddleware) {
		this.statuses = {};
		/** username -> { uid, sockets: Set of socket ids, nowPlaying, hidden } */
		this.presence = new Map();
		this.io = socketio(service);
		if (sessionMiddleware) {
			this.io.engine.use(sessionMiddleware);
		}
		this.io.on('connection', (socket) => {
			const session = socket.request.session;
			const user = session && session.passport ? session.passport.user : null;
			console.info(`User ${user ? user.username : socket.handshake.address} connected to communication system`);

			socket.emit('connected');
			if (!user || !user.username) {
				return;
			}
			// Not for an account disabled or deleted since its login
			require('./middleware/session-guard').check(user.uid, user.username, (valid) => {
				if (!valid || !socket.connected) {
					return socket.disconnect(true);
				}
				// Messages for the user (see emit) and for every member (presence)
				socket.join(user.username);
				socket.join('members');
				this.connect(socket, user);

				socket.on('now-playing', (data) => this.setNowPlaying(user.username, data));
				socket.on('disconnect', () => this.disconnect(socket, user));
			});
		});
	}

	broadcast(event, data) {
		if (this.io) {
			this.io.sockets.emit(event, data);
		}
	}

	emit(room, event, data) {
		console.info(`emit to room: ${room}`, event, data ? data.message : undefined);
		if (this.io) {
			this.io.to(room).emit(event, data);
		}
	}

	status(username) {
		return this.presence && this.presence.has(username) ? 'online' : 'offline';
	}

	setStatus(username, status) {
		this.statuses[username] = status;
	}

	// ---------- Presence ----------

	connect(socket, user) {
		let entry = this.presence.get(user.username);
		if (!entry) {
			entry = { uid: user.uid, sockets: new Set(), nowPlaying: null, hidden: false };
			this.presence.set(user.username, entry);
			// The setting is read once per connection of the user
			require('./model/user').getUserField(user.uid, 'hideListening', (err, hidden) => {
				entry.hidden = !err && String(hidden) === '1';
				this.publish(user.username);
			});
		}
		entry.sockets.add(socket.id);
		this.publish(user.username);
	}

	disconnect(socket, user) {
		const entry = this.presence.get(user.username);
		if (!entry) {
			return;
		}
		entry.sockets.delete(socket.id);
		if (!entry.sockets.size) {
			this.presence.delete(user.username);
			require('./model/user').setUserField(user.uid, 'lastonline', Date.now(), () => {});
			this.publish(user.username);
		}
	}

	/**
	 * What a user plays: { uid, playing, position } from his player, null when stopped.
	 * The private uploads are not shown to the others.
	 */
	setNowPlaying(username, data) {
		const entry = this.presence.get(username);
		if (!entry) {
			return;
		}
		const library = require('./middleware/library');
		const track = data && typeof data.uid === 'string' ? library.getVisibleByUid(data.uid) : null;
		entry.nowPlaying = track && !track.private ? {
			uid: track.uid,
			title: track.title,
			artist: track.artist,
			album: track.album,
			albumArtist: library.albumArtistOf(track),
			duration: track.duration,
			playing: !!data.playing,
			position: Math.max(0, Number(data.position) || 0),
			// Time of the position, to follow along
			at: Date.now()
		} : null;
		this.publish(username);
	}

	/** Closes the sockets of a user (account disabled or deleted) */
	disconnectUser(username) {
		if (this.io) {
			this.io.in(username).disconnectSockets(true);
		}
	}

	setHidden(username, hidden) {
		const entry = this.presence.get(username);
		if (entry) {
			entry.hidden = hidden;
			this.publish(username);
		}
	}

	/** Presence of a user as the other members see it */
	presenceOf(username) {
		const entry = this.presence ? this.presence.get(username) : null;
		return {
			username: username,
			online: !!entry,
			nowPlaying: entry && !entry.hidden ? entry.nowPlaying : null
		};
	}

	/** The members online */
	snapshot() {
		return this.presence ? Array.from(this.presence.keys()).map((username) => this.presenceOf(username)) : [];
	}

	publish(username) {
		this.emit('members', 'presence:update', this.presenceOf(username));
	}
}

module.exports = new Communication();
