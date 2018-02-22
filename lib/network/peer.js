var SocketWrapper = require('socket-wrapper'),
    PeerpinNS,
    crypto   = require('crypto'),
    Blast    = __Protoblast,
    Peer,
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

/**
 * The Peerpin Peer class:
 * other clients connecting to us
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Peerpin.Identity}   identity   The identity this was connected to
 * @param    {Socket}                     connection The first connection
 * @parma    {Object}                     info
 */
Peer = Fn.inherits('Develry.Peerpin.Common', function Peer(identity, connection, info) {

	var that = this;

	// The connection id
	this.id = '';

	// Reference to the identity that received the connection
	this.identity = identity;

	// The verified connections
	this.connections = [];

	// Amount of bytes received
	this.received = 0;

	// Amount of bytes sent
	this.sent = 0;

	// The public key as a buffer
	this.public_buffer = null;

	// The public key hexadecimal string
	this.public_key = '';

	// Add this connection
	this.addConnection(connection, info);
});

/**
 * The peer secret
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.prepareProperty(function secret() {
	var result = this.identity.computeSecret(this.public_buffer);
	return result;
});

/**
 * Reference to peerpin
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setProperty(function peerpin() {
	return this.identity.peerpin;
});

/**
 * The first available wsock
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setProperty(function wsock() {

	var result,
	    i;

	for (i = this.connections.length - 1; i >= 0; i--) {
		result = this.connections[i];

		if (!result._socket) {
			// Remove the connection from the array
			this.connections.splice(i, 1);
			result = null;
		} else {
			break;
		}
	}

	return result;
});

/**
 * Has this peer been verified?
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setProperty(function verified() {
	return this.hasBeenSeen('verified');
});

/**
 * Add a connection
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   connection
 * @param    {Object}   info
 */
Peer.setMethod(function addConnection(connection, info) {

	var that = this,
	    buffer_count,
	    first_data,
	    wsock;

	// The wrapped socket
	wsock = new SocketWrapper(connection);

	if (!this.info) {
		// More connection info
		this.info = info;
		this.id = info.id.toString('hex');
	}

	// Buffer count
	buffer_count = 0;

	// Listen for the connection to close
	connection.on('close', function onClose(had_err) {
		// A connection has closed?
	});

	// Listen for buffers to completely arrive
	wsock.on('receive', function onData(data) {
		buffer_count++;

		that.received += data.length;

		// The very first message is just the unencrypted public key
		if (buffer_count == 1) {
			first_data = data;

			if (!that.public_key) {
				that.setKey(data);
			} else {
				// Double connection?
			}

			// Retireve stored data for this peer
			that.retrieveStoredData(function done(err, result) {

				if (err) {
					throw err;
				}

				// Send our public key again, but encrypted this time
				// We also provide the wrapped socket to use,
				// because the socket hasn't been added to the connections yet
				that._write(that.identity._public_buffer, wsock);
			});

			return;
		}

		// Decrypt the message
		data = that.decrypt(data);

		// The second message should have been an encrypted version of the key
		if (buffer_count == 2) {
			if (that.public_key != data.toString('hex')) {
				// Keys don't match! Someone is faking
				that.emit('wrong_public_key', that, connection, info);
				that.identity.emit('wrong_public_key', that, connection, info);
				connection.destroy();
				return;
			} else {
				// Push to the connections table now that it's verified
				that.connections.push(wsock);

				that.emit('verified', that);
				that.identity.emit('verified_peer', that);
				return;
			}
		}

		// Process the data
		data = that.processData(data);

		console.log('Got data:', data);

		// Emit the processed data
		that.emit('data', data);
	});

	// Send the public key
	this.sent += this.identity._public_buffer.length;
	wsock.send(this.identity._public_buffer);

	// Add info to the wsock object
	wsock.info = info;
});

/**
 * Retrieve stored data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
Peer.setCacheMethod(function retrieveStoredData(callback) {
	this.peerpin.lookupPeer(this, function done(err, result) {
		callback(err, result);
	});
});

/**
 * Store data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
Peer.setCacheMethod(function storeData(callback) {
	this.peerpin.storePeer(this, function done(err, result) {
		callback(err, result);
	});
});

/**
 * Set the public key
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 */
Peer.setMethod(function setKey(chunk) {

	this.public_buffer = chunk;
	this.public_key = chunk.toString('hex');

	this.emit('got_public_key', this.public_key);
});

/**
 * Encrypt a buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 */
Peer.setMethod(function encrypt(chunk) {

	var cipher,
	    result,
	    iv;

	// Create an iv
	iv = crypto.randomBytes(16);

	// Create a new cipher
	cipher = crypto.createCipheriv(this.peerpin.cipher_algorithm, this.secret, iv);

	// Create the new chunk
	result = Buffer.concat([iv, cipher.update(chunk), cipher.final()]);

	return result;
});

/**
 * Decrypt a buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 */
Peer.setMethod(function decrypt(chunk) {

	var decipher,
	    result,
	    iv;

	// Get the iv: the first 16 bytes
	iv = chunk.slice(0, 16);

	// Get the rest
	chunk = chunk.slice(16);

	// Create a decipher
	decipher = crypto.createDecipheriv(this.peerpin.cipher_algorithm, this.secret, iv);

	// Actually decrypt it
	result = Buffer.concat([decipher.update(chunk), decipher.final()]);

	return result;
});

/**
 * Encrypt a buffer and send it to the peer
 * It'll arrive as 1 single chunk
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}        chunk
 * @param    {SocketWrapper} wsock
 *
 * @return   {Boolean}  True if it has been sent, false otherwise
 */
Peer.setMethod(function _write(chunk, wsock) {

	if (wsock == null) {
		wsock = this.wsock;
	}

	if (!wsock) {
		return false;
	}

	// Encrypt the data
	chunk = this.encrypt(chunk);

	// Send the data!
	wsock.send(chunk);

	// Increment the amount of data we sent
	this.sent += chunk.length;

	return true;
});

/**
 * Send data to the other side
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Mixed}   data
 *
 * @return   {Boolean}  True if it has been sent, false otherwise
 */
Peer.setMethod(function send(data) {

	var var_type,
	    type,
	    buf;

	if (!this.wsock) {
		return false;
	}

	var_type = typeof data;

	switch (var_type) {

		case 'undefined':
			type = 1;
			data = [];

		case 'boolean':
			type = 2;
			data = [data];
			break;

		case 'number':
			type = 3;
			data = String(data);
			break;

		case 'string':
			type = 4;
			break;

		case 'object':
			if (data == null) {
				type = 5;
				data = [];
				break;
			} else if (Buffer.isBuffer(data)) {
				type = 0;
				break;
			}
			// Fall through

		default:
			type = 255;
			data = JSON.stringify(data);
			break;
	}

	// Turn the data into a buffer
	data = new Buffer(data);
	type = new Buffer([type]);

	// Add the type
	data = Buffer.concat([type, data]);

	return this._write(data);
});

/**
 * Process decrypted incoming data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}   chunk
 */
Peer.setMethod(function processData(chunk) {

	var result,
	    chunk,
	    type;

	try {
		type = chunk[0];
		chunk = chunk.slice(1);

		switch (type) {
			// Buffer
			case 0:
				result = chunk;
				break;

			case 1:
				result = undefined;
				break;

			case 2:
				result = Boolean(chunk[0]);
				break;

			case 3:
				result = Number(chunk.toString());
				break;

			case 4:
				result = chunk.toString();
				break;

			case 5:
				result = null;
				break;

			case 255:
				result = JSON.parse(chunk.toString());
				break;
		}
	} catch (err) {
		// @TODO: fail not so silently?
		return;
	}

	return result;
});

/**
 * Destroy this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setMethod(function destroy() {

	var wsock,
	    i;

	// Close all connections
	for (i = 0; i < this.connections.length; i++) {
		wsock = this.connections[i];

		if (wsock && wsock._socket) {
			wsock._socket.destroy();
		}
	}

	// Clear the connections
	this.connections.length = 0;

	// Remove the peer from the peer list
	i = this.identity.peers.indexOf(this);

	if (i > -1) {
		this.identity.peers.splice(i, 1);
	}

	// Emit the destroyed event
	this.emit('destroyed');

	// Emit on the identity
	this.identity.emit('disconnected_peer', this);
});