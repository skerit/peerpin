'use strict';

var PeerpinNS,
    Identity,
    mnemonic = require('../external/mnemonic.js'),
    libpath  = require('path'),
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
 * The number of peers we are trying to connect to
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @type     {Number}
 */
Identity.setProperty(function connecting_peer_count() {

	if (!this.swarm) {
		return 0;
	}

	return this.swarm.connecting;
});

/**
 * The amount of connected peers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type     {Number}
 */
Identity.setProperty(function connected_peer_count() {
	return this.peers.length;
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
 * Our IP address
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @type     {String}
 */
Identity.setProperty(function ip() {

	if (!this.swarm || !this.swarm._discovery || !this.swarm._discovery.me) {
		return '';
	}

	return this.swarm._discovery.me.host || '';
});

/**
 * The port we are listening on
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @type     {Number}
 */
Identity.setProperty(function port() {
	return this._connected_port;
}, function setPort(value) {
	return this._preferred_port = value;
});

/**
 * The port we are listening on for discovery purposes
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @type     {Number}
 */
Identity.setProperty(function discovery_port() {

	var result;

	if (this.swarm && this.swarm._discovery && this.swarm._discovery.me) {
		result = this.swarm._discovery.me.port;
	}

	return result;
}, function setPort() {
	throw new Error('Discovery port is read-only');
});

/**
 * The name of our settings file
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @type     {String}
 */
Identity.setProperty(function settings_filename() {
	return this.public_key + '.json';
});

/**
 * The path to the settings file
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @type     {String}
 */
Identity.setProperty(function settings_filepath() {

	if (!this.storage_dir) {
		throw new Error('Storage dir has not been set yet');
	}

	return libpath.resolve(this.storage_dir, this.settings_filename);
});

/**
 * Initialize the identity
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 */
Identity.setMethod(function init() {

	var that = this,
	    settings_path;

	Fn.series(function getDir(next) {
		that.peerpin.getStorageDir('identities', function gotDir(err, dir_path) {

			if (err) {
				return next(err);
			}

			that.storage_dir = dir_path;
			settings_path = that.settings_filepath;
			next();
		});
	}, function retrieveSettings(next) {
		fs.readFile(settings_path, 'utf8', function gotFile(err, result) {

			if (err) {
				if (err.code !== 'ENOENT') {
					return next(err);
				}
			}

			if (result) {
				that._settings = Blast.Bound.JSON.undry(result);
			}

			if (!that._settings) {
				that._settings = {};
			}

			next();
		});
	}, function done(err) {

		if (err) {
			return that.emit('error', err);
		}

		that.emit('ready');
	});
});

/**
 * Get/set a setting
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {String}   name
 * @param    {Mixed}    value
 *
 * @return   {Mixed}
 */
Identity.setMethod(function setting(name, value) {

	var that = this;

	if (arguments.length == 1) {
		return this._settings[name];
	}

	this._settings[name] = value;

	fs.writeFile(this.settings_filepath, Blast.Bound.JSON.dry(this._settings), function done(err) {

		if (err) {
			throw err;
		}

	});
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
 * Create an off-line peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Buffer|String}   public_key
 *
 * @return   {Develry.Peerpin.Peer}
 */
Identity.setMethod(function getOfflinePeer(public_key) {

	var public_buffer,
	    peer

	if (typeof public_key == 'string') {
		public_buffer = new Buffer(public_key, 'hex');
	} else {
		public_buffer = public_key;
		public_key = public_buffer.toString('hex');
	}

	peer = new PeerpinNS.Peer(this);
	peer.setKey(public_buffer);

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
			data = data.trim();

			// See if it's a mnemonic
			if (data.indexOf(' ') > -1) {
				data = mnemonic.decode(data);
			}

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
 * @version  0.1.2
 */
Identity.setMethod(function computeSecret(public_buffer) {

	if (!public_buffer || !Buffer.isBuffer(public_buffer)) {
		throw new Error('No buffer was given');
	}

	if (!public_buffer.length) {
		throw new Error('Can not compute secret for empty buffer');
	}

	return this.crypto_keys.computeSecret(public_buffer);
});

/**
 * Process an incoming connection
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.2
 *
 * @param    {Socket}   connection
 * @param    {Object}   info
 */
Identity.setMethod(function processConnection(connection, info) {

	// Ignore connections coming from ourselves
	if ((info.host == '0.0.0.0' || info.host == this.ip || info.host == '::ffff:' + this.ip) && info.port == this.port) {
		return;
	}

	this.getPeer(connection, info);
});

/**
 * Claim a unique value in this network
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Boolean}  force     Force the claim, don't wait for the network
 * @param    {String}   db_name   The type of value (eg: "username")
 * @param    {String}   value     The actual value
 * @param    {Object}   data      Optional extra info
 * @param    {Function} callback
 */
Identity.setMethod(function claimValue(force, db_name, value, data, callback) {

	var that = this,
	    result_block,
	    attempts = 0,
	    pledge;

	if (typeof force != 'boolean') {
		callback = data;
		data = value;
		value = db_name;
		db_name = force;
		force = false;
	}

	if (typeof data == 'function') {
		callback = data;
		data = null;
	}

	pledge = Fn.series(function waitForReady(next) {
		that.peerpin.afterOnce('blockchain_ready', function ready() {
			next();
		});
	}, function waitForVote(next) {

		var doNext = Fn.regulate(function doNext() {
			next();
		});

		if (force) {
			return doNext();
		}

		that.blockchain.afterOnce('first_length_vote', function(length) {
			doNext();
		});

		// Call next in 10 seconds
		setTimeout(doNext, 10000);

	}, function checkNetworkState(next) {

		attempts++;

		// The chain is not behind, so continue!
		if (force || !that.blockchain.is_behind) {
			return next();
		}

		// Do it anyway after 10 attempts
		if (attempts > 10) {
			return next();
		}

		setTimeout(function() {
			checkNetworkState(next);
		}, 1000);
	}, function doChecks(next) {

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
		db = that.blockchain.getClaimDb(db_name);

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

		that.blockchain.addDataToChain(transaction_data, that.private_key_buffer, function done(err, block) {

			if (err) {
				return next(err);
			}

			result_block = block;

			return next();
		});
	}, function done(err) {

		if (err) {
			return callback(err);
		}

		callback(null, result_block);
	});

	return pledge;
});

/**
 * Connect to the network
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @param    {Number}   preferred_port
 * @param    {Function} callback
 */
Identity.setMethod(function connect(preferred_port, callback) {

	var that = this;

	if (typeof preferred_port == 'function') {
		callback = preferred_port;
		preferred_port = null;
	}

	if (!callback) {
		callback = Fn.thrower;
	}

	// If no port is given, see if the instance has one
	if (!preferred_port) {
		preferred_port = this._preferred_port;
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

	this.peerpin.getFreePort(preferred_port, function gotRandomPort(err, port) {

		var swarm_options;

		if (err) {
			return callback(err);
		}

		swarm_options = {
			utp            : true,
			tcp            : true,
			maxConnections : 0,
			dns            : {
				// Yes: "server", not "servers"
				server     : that.peerpin.swarm_defaults.dns.server.concat(['calamity.develry.be:53'])
			},
			dht            : {
				bootstrap  : that.peerpin.swarm_defaults.dht.bootstrap
			}
		};

		// Create new swarm
		that.swarm = Swarm(swarm_options);

		// Store our id as a hex
		that.id = that.swarm.id.toString('hex');

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

		// Listen for peers that are trying to connect
		that.swarm.on('connecting', function onConnecting(address) {
			that.holepunchAttemptedConnection(address);
		});

		that._connected_port = port;

		that.emit('listening', port);
		callback();
	});
});

/**
 * Process an incoming connection
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Object}   address
 */
Identity.setMethod(function holepunchAttemptedConnection(address) {

	var that = this,
	    peer,
	    conn,
	    i;

	// Ignore ourselves
	if (address.host == this.ip) {
		return;
	}

	for (i = 0; i < this.peers.length; i++) {
		peer = this.peers[i];

		// If we already have a connection to this peer, don't send a syn packet
		if (peer && peer.connections && peer.connections.length && peer.info) {
			if (peer.info.host == address.host && peer.info.port == address.port) {
				return;
			}
		}
	}

	// Send a SYN packet for hole punching, since swarm doesn't do this
	this.sendSYN(address.host, address.port);
	this.sendSYN(address.host, this.port);

	this.emit('incoming_connection', address);
});

/**
 * Sign a buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Buffer}    buffer
 * @param    {String}    private_key_hex
 *
 * @return   {String}    The hexadecimal signature string
 */
Identity.setMethod(function signBuffer(buffer, private_key_hex) {
	this.peerpin.blockchain.chainful.signBuffer(buffer, private_key_hex);
});

/**
 * Verify a signed buffer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Buffer}    buffer
 * @param    {String}    signature
 * @param    {String}    public_key_hex
 *
 * @return   {Boolean}
 */
Identity.setMethod(function verifyBuffer(buffer, signature, public_key_hex) {
	this.peerpin.blockchain.chainful.verifyBuffer(buffer, signature, public_key_hex);
});

/**
 * See if this peer is connected and return it
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {String}    public_key
 *
 * @return   {Peer}
 */
Identity.setMethod(function getConnectedPeer(public_key) {

	var peer,
	    i;

	if (Buffer.isBuffer(public_key)) {
		public_key = public_key.toString('hex');
	}

	for (i = 0; i < this.peers.length; i++) {
		peer = this.peers[i];

		if (peer.public_key == public_key) {
			return peer;
		}
	}

	return false;
});