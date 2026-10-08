'use strict';

/*
 * Small compatibility layer exposing the callback based API of node_redis v2
 * (lowercase commands, variadic arguments, trailing callback, chained multi)
 * on top of the promise based client of node-redis >= 4.
 * The client must be created with RESP: 2 so replies keep the v2 shape.
 */

function flattenArguments(args, output) {
	output = output || [];
	args.forEach(function (arg) {
		if (Array.isArray(arg)) {
			flattenArguments(arg, output);
		} else if (arg !== null && typeof arg === 'object' && !Buffer.isBuffer(arg)) {
			Object.keys(arg).forEach(function (field) {
				output.push(field, String(arg[field]));
			});
		} else if (Buffer.isBuffer(arg)) {
			output.push(arg);
		} else {
			output.push(String(arg));
		}
	});
	return output;
}

function hashReplyToObject(reply) {
	if (!Array.isArray(reply) || !reply.length) {
		return null;
	}
	var object = {};
	for (var i = 0; i < reply.length; i += 2) {
		object[reply[i]] = reply[i + 1];
	}
	return object;
}

function transformReply(command, reply) {
	return command === 'HGETALL' ? hashReplyToObject(reply) : reply;
}

function parseCommand(name, args) {
	args = Array.prototype.slice.call(args);
	var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
	var command = name.toUpperCase();
	return {
		command: command,
		args: [command].concat(flattenArguments(args)),
		callback: callback
	};
}

function createMulti(client) {
	var multi = client.multi();
	var commands = [];
	return new Proxy({}, {
		get: function (target, name) {
			if (name === 'exec') {
				return function (callback) {
					callback = callback || function () {};
					multi.exec().then(function (replies) {
						callback(null, replies.map(function (reply, index) {
							return transformReply(commands[index], reply);
						}));
					}, callback);
				};
			}
			return function () {
				var parsed = parseCommand(name, arguments);
				commands.push(parsed.command);
				multi.addCommand(parsed.args);
				return this;
			};
		}
	});
}

module.exports = function (client) {
	var legacyClient = new Proxy({}, {
		get: function (target, name) {
			switch (name) {
			case 'on':
				return function () {
					client.on.apply(client, arguments);
					return legacyClient;
				};
			case 'multi':
				return function () {
					return createMulti(client);
				};
			case 'quit':
				return function (callback) {
					client.close().then(function () {
						if (callback) callback(null);
					}, callback || function () {});
				};
			case 'send_command':
				return function (command, args, callback) {
					legacyClient[command].apply(legacyClient, (args || []).concat(callback ? [callback] : []));
				};
			default:
				if (typeof name !== 'string') {
					return undefined;
				}
				return function () {
					var parsed = parseCommand(name, arguments);
					var promise = client.sendCommand(parsed.args);
					promise.then(function (reply) {
						if (parsed.callback) parsed.callback(null, transformReply(parsed.command, reply));
					}, function (err) {
						if (parsed.callback) {
							parsed.callback(err);
						} else {
							client.emit('error', err);
						}
					});
				};
			}
		}
	});
	return legacyClient;
};
