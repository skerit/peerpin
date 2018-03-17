'use strict';

var SocketWrapper = require('./socket_wrapper.js'),
    ChainfulNS,
    PeerpinNS,
    crypto   = require('crypto'),
    Blast    = __Protoblast,
    Peer,
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

// Get the Chainful namespace
ChainfulNS = Fn.getNamespace('Develry.Chainful');

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

	// The connection counter
	this.connection_count = 0;

	// Amount of bytes received
	this.received = 0;

	// Amount of bytes sent
	this.sent = 0;

	// The public key as a buffer
	this.public_buffer = null;

	// The public key hexadecimal string
	this.public_key = '';

	// The data belonging to this user
	this.data = {};

	// Callbacks waiting for response
	this.callbacks = new Map();

	// Callback id
	this.callback_id = 0;

	// The blocks this user has sent us
	this.block_hashes_received = new Map();

	// The blocks we sent to this user
	this.block_hashes_sent = new Map();

	// The highes block index we received from this peer
	this.highest_block_index = -1;

	// Talk listeners
	this.talk_listeners = {};

	if (connection) {
		// Add this connection
		this.addConnection(connection, info);
	}

	// Request the chain state
	this.blockchain.afterOnce('ready', function readyChain() {
		that.emit('initial_chain_state_request');
		that.talk('chain_state', that.blockchain.length);
	});
});

/**
 * Talk handlers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setStatic('talk_handlers', {});

/**
 * Talk requests
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setStatic(function setTalkHandler(type, handler) {
	this.talk_handlers[type] = handler;
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
 * The ip address of this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setProperty(function ip() {
	return this.info.host;
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
 * JSON serialization support
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Peer.setMethod(function toJSON() {
	return {
		id         : this.id,
		public_key : this.public_key,
		data       : this.data
	};
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
	    was_restored,
	    buffer_count,
	    first_data,
	    wsock;

	// Increment the connection counter
	this.connection_count++;

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

		var index;

		// Destroy the wrapper
		wsock.destroy();

		// Decrease the connection count
		that.connection_count--;

		// Get the index
		index = that.connections.indexOf(wsock);

		if (index > -1) {
			that.connections.splice(index, 1);
		}

		if (that.connection_count < 1) {
			// Destroy this peer instance
			that.destroy();
		}
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

				was_restored = !!result;

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

				// If this peer was not restored from disk, store him now
				if (!was_restored) {
					that.storeData();
				}

				// Only emit the verify & init the peer in the blockchain
				// if it hasn't been verified before
				if (!that.verified) {
					that.emitOnce('verified', that);
					that.identity.emit('verified_peer', that);

					// Specifically let the blockchain now of this verified peer
					that.blockchain.initPeer(that);
				}

				return;
			}
		}

		// Process the data
		that.processData(data);
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
Peer.setMethod(function retrieveStoredData(callback) {

	if (!callback) {
		callback = Fn.thrower;
	}

	this.peerpin.lookupPeer(this, function done(err, result) {
		// @TODO: do something with this data
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
Peer.setMethod(function storeData(callback) {

	if (!callback) {
		callback = Fn.thrower;
	}

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
 * @param    {Mixed}      data
 * @param    {Function}   callback   Function to be called after message is sent
 *
 * @return   {Boolean}  True if it has been sent, false otherwise
 */
Peer.setMethod(function send(data, callback) {

	var var_type,
	    sent,
	    type,
	    buf;

	if (this.wsock) {
		// Serialize the data to a buffer
		data = ChainfulNS.Chainful.serialize(data);

		sent = this._write(data);
	} else {
		sent = false;
	}

	if (callback) {
		Blast.nextTick(callback, null, null, sent);
	}

	return sent;
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
		// @TODO: set a limit on the allowed block chunk size?
		result = ChainfulNS.Chainful.unserialize(chunk);
	} catch (err) {
		return;
	}

	switch (result.type) {
		case 'new_block':
			this.processBlock(result.block, true);
			return;

		case 'block':
			this.processBlock(result.block, false);
			break;

		case 'talk':
			this.handleTalkRequest(result);
			break;

		case 'response':
			this.handleTalkResponse(result);
			break;
	}

	return result;
});

/**
 * Get the amount of times we received this block from this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 *
 * @return   {Number}
 */
Peer.setMethod(function getBlockReceivedAmount(block) {

	var amount;

	if (!block.hash) {
		return null;
	}

	amount = this.block_hashes_received.get(block.hash_string);

	return amount || 0;
});

/**
 * Increase the amount of times we received this block from this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 *
 * @return   {Number}
 */
Peer.setMethod(function increaseBlockReceivedAmount(block) {

	var amount;

	if (!block.hash) {
		return null;
	}

	amount = this.block_hashes_received.get(block.hash_string) || 0;
	amount++;

	this.block_hashes_received.set(block.hash_string, amount);

	this.highest_block_index += block.index;

	return amount;
});

/**
 * Get the amount of times we sent this block to this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 *
 * @return   {Number}
 */
Peer.setMethod(function getBlockSentAmount(block) {

	var amount;

	if (!block.hash) {
		return null;
	}

	amount = this.block_hashes_sent.get(block.hash_string);

	return amount || 0;
});

/**
 * Increase the amount of times we sent this block to this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 *
 * @return   {Number}
 */
Peer.setMethod(function increaseBlockSentAmount(block) {

	var amount;

	if (!block.hash) {
		return null;
	}

	amount = this.block_hashes_sent.get(block.hash_string) || 0;
	amount++;

	this.block_hashes_sent.set(block.hash_string, amount);

	this.highest_block_index = block.index;

	return amount;
});

/**
 * Does this peer probably have this block?
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 *
 * @return   {Boolean}
 */
Peer.setMethod(function propablyHasBlock(block) {

	if (this.getBlockSentAmount(block) || this.getBlockReceivedAmount(block)) {
		return true;
	}

	if (block.index < this.highest_block_index) {
		return true;
	}

	return false;
});

/**
 * Send a block to this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 * @param    {String}                   type      The type of block (defaults to "block")
 * @param    {Function}                 callback
 */
Peer.setMethod(function sendBlock(block, type, callback) {

	var data;

	if (typeof type == 'function') {
		callback = type;
		type = 'block';
	}

	if (!type) {
		type = 'block';
	}

	// Increase the block sent amount counter
	this.increaseBlockSentAmount(block);

	data = {
		type  : type,
		block : block.buffer
	};

	this.send(data, callback);
});

/**
 * Process incoming block
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Buffer}    block_buffer
 * @param    {Boolean}   deemed_new
 */
Peer.setMethod(function processBlock(block_buffer, deemed_new) {

	var that = this,
	    block;

	// Create a new block instance
	block = ChainfulNS.Block.fromBuffer(block_buffer, this.blockchain.chainful, null, function gotBuffer(err) {

		if (err) {
			return console.error('Failed to set received block buffer:', err);
		}

		// Ignore blocks without a hash
		if (!block.hash) {
			return;
		}

		that.blockchain.receivedPeerBlock(that, block, deemed_new);
	});
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

/**
 * Send data to this peer and wait for a response
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}     type
 * @param    {Mixed}      data
 * @param    {Function}   callback   Will be called with the response
 *
 * @return   {Boolean}  True if it has been sent, false otherwise
 */
Peer.setAfterMethod('verified', function talk(type, data, callback) {

	var that = this,
	    callback_id = this.callback_id++,
	    sent,
	    payload;

	if (!callback) {
		callback = Fn.thrower;
	}

	// Create the data
	payload = {
		type        : 'talk',
		talk        : type,
		callback_id : callback_id,
		data        : data
	};

	sent = this.send(payload);

	if (sent) {
		// Remember this callback
		this.callbacks.set(callback_id, callback);
	}

	return sent;
});

/**
 * Handle a talk request packet
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   packet
 */
Peer.setMethod(function handleTalkRequest(packet) {

	var that = this,
	    handler;

	// See if any listeners have been defined
	handler = this.talk_listeners[packet.talk];

	// If not: maybe a class-wide one?
	if (!handler) {
		handler = Peer.talk_handlers[packet.talk];
	}

	if (typeof handler != 'function') {
		this.send({
			type        : 'response',
			callback_id : packet.callback_id,
			error       : 'No such handler found for "' + packet.talk + '"'
		});
		return;
	}

	handler.call(this, packet.data, function gotResponse(err, response) {

		if (err) {
			that.send({
				type        : 'response',
				callback_id : packet.callback_id,
				error       : err.message || true
			});
			return;
		}

		that.send({
			type        : 'response',
			callback_id : packet.callback_id,
			response    : response
		});
	});
});

/**
 * Handle a talk response packet
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   packet
 */
Peer.setMethod(function handleTalkResponse(packet) {

	var that = this,
	    callback = this.callbacks.get(packet.callback_id);

	if (!callback) {
		return;
	}

	// Delete this callback, making sure it won't get called again
	this.callbacks.delete(packet.callback_id);

	if (packet.error) {

		console.error('Responding to Talk request with error:', packet.error);

		callback.call(this, new Error(packet.error));
	} else {
		callback.call(this, null, packet.response);
	}
});

/**
 * Add an instance talk listener
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}     type
 * @param    {Function}   callback
 */
Peer.setMethod(function onTalk(type, callback) {

	var that = this;

	if (this.talk_listeners[type]) {
		throw new Error('This peer instance already has a listener for "' + type + '"');
	}

	this.talk_listeners[type] = callback;
});

/**
 * Get a claim value for this peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   claim_db
 *
 * @return   {Mixed}
 */
Peer.setMethod(function getClaimValue(claim_db) {

	var transaction = this.peerpin.findClaimTransaction(claim_db, this);

	if (!transaction) {
		return null;
	}

	return transaction.data.value;
});