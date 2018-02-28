'use strict';

var PeerpinNS,
    Identity,
    mnemonic = require('../external/mnemonic.js'),
    crypto   = require('crypto'),
    Swarm    = require('discovery-swarm'),
    Blast    = __Protoblast,
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

/**
 * The Peerpin identity class:
 * the identity of this client on the network
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Peerpin.Peerpin}   peerpin
 */
Identity = Fn.inherits('Develry.Peerpin.Common', function Identity(peerpin) {

	// Our id
	this.id = '';

	// Reference to the peerpin network
	this.peerpin = peerpin;

	// Set us in the peerpin identity list
	peerpin.identities.push(this);

	// Connections to other clients
	this.peers = [];
});

/**
 * Private key getter/setter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setProperty(function private_key() {
	return this._private_key;
}, function setPrivateKey(key) {
	this.setKeys(key);
});

/**
 * Public key getter/setter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setProperty(function public_key() {
	return this._public_key;
});

/**
 * Private key mnemonic getter/setter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setProperty(function private_mnemonic() {
	return this._private_mnemonic;
}, function setPrivateMnemonic(value) {
	this.setKeys(mnemonic.decode(value));
});

/**
 * Public key mnemonic getter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setProperty(function public_mnemonic() {
	return this._public_mnemonic;
});

/**
 * Private key buffer getter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setProperty(function private_key_buffer() {
	return this._private_buffer;
});

/**
 * Public key buffer getter
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setProperty(function public_key_buffer() {
	return this._public_buffer;
});

/**
 * Get a peer instance for the given connection
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   connection
 * @param    {Object}   info
 *
 * @return   {Develry.Peerpin.Peer}
 */
Identity.setMethod(function getPeer(connection, info) {

	var that = this,
	    peer,
	    id = info.id.toString('hex'),
	    i;

	for (i = 0; i < this.peers.length; i++) {
		if (this.peers[i].id == id) {
			peer = this.peers[i];
			break;
		}
	}

	if (peer) {
		// Add this connection
		// @TODO: only do this after verification
		peer.addConnection(connection, info);
	} else {
		// Create a new peer
		peer = new PeerpinNS.Peer(this, connection, info);

		// Add it to the peer list
		this.peers.push(peer);

		// Emit this peer now as "connecting"
		this.emit('connecting_peer', peer);

		// Wait for the public key to emit it as a new peer
		peer.once('got_public_key', function gotKey() {
			that.emit('peer', peer);
		});
	}

	return peer;
});

/**
 * Set the keys
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setMethod(function setKeys(data, from_crypto) {

	var keys;

	if (from_crypto) {
		keys = data;
	} else {
		keys = crypto.createECDH('secp256k1');

		if (typeof data == 'string') {
			keys.setPrivateKey(data, 'hex')
		} else {
			keys.setPrivateKey(data);
		}
	}

	// Store the keys object
	this.crypto_keys = keys;

	// Generate the private & public key buffers
	this._private_buffer = keys.getPrivateKey(null, 'compressed');
	this._public_buffer = keys.getPublicKey(null, 'compressed');

	// Convert the buffers to hexadecimal strings
	this._private_key = this._private_buffer.toString('hex');
	this._public_key = this._public_buffer.toString('hex');

	// Create the mnemonic keys
	this._public_mnemonic = mnemonic.encode(this.public_key);
	this._private_mnemonic = mnemonic.encode(this.private_key);
});

/**
 * Create new keys
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setMethod(function createKeys() {

	// Create new keys object
	var keys = crypto.createECDH('secp256k1');

	// Generate the keys
	keys.generateKeys();

	this.setKeys(keys, true);
});

/**
 * Compute a secret
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Identity.setMethod(function computeSecret(public_buffer) {
	return this.crypto_keys.computeSecret(public_buffer);
});

/**
 * Process an incoming connection
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Socket}   connection
 * @param    {Object}   info
 */
Identity.setMethod(function processConnection(connection, info) {
	this.getPeer(connection, info);
});

/**
 * Claim a unique value in this network
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   db_name   The type of value (eg: "username")
 * @param    {String}   value     The actual value
 * @param    {Object}   data      Optional extra info
 * @param    {Function} callback
 */
Identity.setMethod(function claimValue(db_name, value, data, callback) {

	var that = this;

	if (typeof data == 'function') {
		callback = data;
		data = null;
	}

	Blast.nextTick(function doChecks() {

		var transaction_data,
		    existing,
		    db;

		// Only allow lowercase names
		if (db_name.toLowerCase() !== db_name) {
			return callback(new Error('The db_name of the value has to be lower case'));
		}

		// If a non-null value is returned, this value is a json string
		if (Blast.Bound.JSON.safeParse(value) !== null) {
			return callback(new Error('JSON strings are not allowed'));
		}

		if (data && typeof data != 'object') {
			return callback(new Error('If extra data is provided it must be an object'));
		}

		// Get the database
		db = that.peerpin.blockchain.getClaimDb(db_name);

		// If there already is a transaction for this value, throw an error
		if (db.has(value)) {
			return callback(new Error('This value has already been taken'));
		}

		transaction_data = {
			type  : 'value_claim',
			db    : db_name,
			value : value
		};

		if (data) {
			transaction_data.data = data;
		}

		that.peerpin.blockchain.addDataToChain(transaction_data, that.private_key_buffer, callback);
	});
});

/**
 * Connect to the network
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function} callback
 */
Identity.setMethod(function connect(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	if (!this._public_key) {
		return Blast.setImmediate(function() {
			callback(new Error('You need to set your keys first'));
		});
	}

	if (this.hasBeenSeen('listening') || this.hasBeenSeen('connecting')) {
		return this.afterOnce('listening', callback);
	}

	this.emit('connecting');

	this.peerpin.getFreePort(function gotRandomPort(err, port) {

		if (err) {
			return callback(err);
		}

		// Create new swarm
		that.swarm = Swarm({
			utp            : true,
			tcp            : true,
			maxConnections : 0,
			dns            : {
				servers    : that.peerpin.swarm_defaults.dns.server
			},
			dht            : {
				bootstrap  : that.peerpin.swarm_defaults.dht.bootstrap
			}
		});

		// Store our id as a hex
		that.id = that.swarm.id.toString('hex');

		console.log('My id is', that.id);

		// Listen on the free port
		that.swarm.listen(port);

		// Join the network
		that.swarm.join(that.peerpin.name, {announce: true}, function firstRoundDone() {
			that.emit('first_round_done');
		});

		// Listen for new connections
		that.swarm.on('connection', function gotConnection(connection, info) {
			that.processConnection(connection, info);
		});

		that.emit('listening');
		callback();
	});
});