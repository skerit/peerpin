'use strict';

var SocketWrapper,
    PeerpinNS,
    Blast      = __Protoblast,
    Fn         = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

/**
 * The SocketWrapper Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Socket}   socket
 */
SocketWrapper = Fn.inherits('Informer', 'Develry.Peerpin', function SocketWrapper(socket) {
	this._socket = null;
	this._listener = null;
	this._incoming = new Buffer(0);
	this._outgoing = new Buffer(0);
	this._writing = false;

	if (socket) {
		this.attach(socket);
	}
});

/**
 * Get incoming buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Buffer|null}
 */
SocketWrapper.setProperty(function incoming() {
	return this._incoming;
});

/**
 * Get outgoing buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Buffer|null}
 */
SocketWrapper.setProperty(function outgoing() {
	return this._outgoing;
});

/**
 * Is wrapper attached to a socket?
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Boolean}
 */
SocketWrapper.setProperty(function is_attached() {
	return this._socket !== null;
});

/**
 * Attach wrapper to a socket
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Socket}     socket
 */
SocketWrapper.setMethod(function attach(socket) {

	if (this.is_attached) {
		return;
	}

	this._socket = socket;
	this._listener = onData.bind(this);
	socket.on('data', this._listener);

	if (this._outgoing.length) {
		this._write();
	}

	function onData(data) {
		if (!this._incoming)
			return;

		if (data) {
			this._incoming = Buffer.concat([this._incoming, data]);
			this.emit('read', data);
		}

		while (this._incoming.length >= 4) {
			let size = this._incoming.readUInt32BE(0);

			if (this._incoming.length < 4 + size) {
				break;
			}

			let message = this._incoming.slice(4, 4 + size);

			this._incoming = this._incoming.slice(4 + size);
			this.emit('receive', message);
		}
	};
});

/**
 * Detach from a socket
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
SocketWrapper.setMethod(function detach() {

	if (!this.is_attached) {
		return;
	}

	this._socket.removeListener('data', this._listener);
	this._socket = null;
	this._listener = null;
	this.clear();
});

/**
 * Send data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   data     Data to send
 */
SocketWrapper.setMethod(function send(data) {

	if (!this._outgoing) {
		return;
	}

	if (data) {
		let message = Buffer.allocUnsafe(4 + data.length);
		message.writeUInt32BE(data.length, 0);
		message.fill(data, 4);
		this._outgoing = Buffer.concat([this._outgoing, message]);

		this.emit('send', data);
	}

	this._write();
});

/**
 * Clear buffers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
SocketWrapper.setMethod(function clear() {
	if (this._incoming) {
		this._incoming = new Buffer(0);
	}

	if (this._outgoing) {
		this._outgoing = new Buffer(0);
	}
});

/**
 * Destroy wrapper
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
SocketWrapper.setMethod(function destroy() {
	this.detach();
	this._incoming = null;
	this._outgoing = null;
});

/**
 * Actually send data via socket
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
SocketWrapper.setMethod(function _write() {

	var that = this;

	if (this._writing || !this._socket || !this._outgoing)
		return;

	if (this._socket.destroyed) {
		this.detach();
		return;
	}

	if (!this._outgoing.length) {
		this.emit('flush');
		return;
	}

	this._writing = true;
	let buffer = this._outgoing;
	this._outgoing = new Buffer(0);

	this.emit('write', buffer);
	this._socket.write(buffer, undefined, function() {
		that._writing = false;
		that._write();
	});
});

module.exports = SocketWrapper;