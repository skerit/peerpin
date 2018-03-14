'use strict';

var SwarmDefaults = require('datland-swarm-defaults'),
    PeerpinNS,
    Peerpin,
    Network,
    ChainfulNS = require('chainful'),
    Chainful   = ChainfulNS.Chainful,
    libpath    = require('path'),
    Blast      = __Protoblast,
    net        = require('net'),
    fs         = require('fs'),
    Fn         = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

/**
 * The Peerpin Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   name
 * @param    {Object}   options
 */
Peerpin = Fn.inherits('Informer', 'Develry.Peerpin', function Peerpin(name, options) {

	if (typeof name == 'object') {
		options = name;
		name = options.name;
	}

	if (!options) {
		options = {};
	}

	// Store the options
	this.options = options;

	// And the name of the network
	this.name = name;

	// Swarm defaults
	this.swarm_defaults = SwarmDefaults();

	// The loaded identities
	this.identities = [];

	// Create the blockchain
	this.blockchain = new PeerpinNS.Blockchain(this);
});

/**
 * The amount of open connections
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Number}
 */
Peerpin.setProperty(function number_of_connections() {

	var total = 0,
	    i;

	for (i = 0; i < this.identities.length; i++) {
		total += this.identities[i].connected_peer_count;
	}

	return total;
});

/**
 * The amount of peers we are trying to connect to
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @property  {Number}
 */
Peerpin.setProperty(function number_of_connection_attempts() {

	var total = 0,
	    i;

	for (i = 0; i < this.identities.length; i++) {
		total += this.identities[i].connecting_peer_count;
	}

	return total;
});

/**
 * The cipher algorithm to use
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {String}
 */
Peerpin.setProperty(function cipher_algorithm() {
	return this.options.cipher_algorithm || 'aes-256-ctr';
});

/**
 * The default store_task property
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type    {Function}
 */
Peerpin.prepareProperty(function store_task() {
	return function store_task(peer, callback) {
		var that = this;

		if (!callback) {
			callback = Fn.thrower;
		}

		this.getStorageDir('peer', function gotDir(err, dir_path) {

			var peer_path,
			    packed;

			if (err) {
				return callback(err);
			}

			// Pack the peer's data
			packed = Chainful.serialize(peer);

			// Construct the path to the file
			peer_path = libpath.join(dir_path, peer.public_key + '.pack');

			fs.writeFile(peer_path, packed, function done(err) {

				if (err) {
					return callback(err);
				}

				callback(null);
			});
		});
	};
});

/**
 * Set a method that'll look for stored identity data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @type    {Function}
 */
Peerpin.prepareProperty(function lookup_task() {
	return function lookup_task(peer, callback) {
		var that = this;

		if (!callback) {
			callback = Fn.thrower;
		}

		this.getStorageDir('peer', function gotDir(err, dir_path) {

			var peer_path;

			if (err) {
				return callback(err);
			}

			// Construct the path to the possible file
			peer_path = libpath.join(dir_path, peer.public_key + '.pack');

			fs.readFile(peer_path, function done(err, packed) {

				var data;

				if (err) {
					// The file doesn't exist
					if (err.code == 'ENOENT') {
						callback(null, null);
					} else {
						callback(err);
					}

					return;
				}

				data = Chainful.unserialize(packed);

				callback(null, data);
			});
		});
	};
});

/**
 * Create an identity to join the network
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @return  {Develry.Peerpin.Identity}
 */
Peerpin.setMethod(function createIdentity() {

	var instance = new PeerpinNS.Identity(this);

	return instance;
});

/**
 * Set the location where to store chain data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}     path
 * @param    {Function}   callback
 *
 * @return   {Pledge}
 */
Peerpin.setMethod(function setMainStorageDir(path, callback) {

	var that = this;

	return this.createDirectory(path, function done(err) {

		if (err) {
			return callback(err);
		}

		that.storage_dir = path;
		that.emit('storage_dir', path);

		callback(null);
	});
});

/**
 * Get a storage sub directory
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}     type
 * @param    {Function}   callback
 */
Peerpin.setMethod(function getStorageDir(type, callback) {

	var that = this;

	this.afterOnce('storage_dir', function gotStorageDir() {

		var new_dir_path = libpath.join(that.storage_dir, type);

		that.createDirectory(new_dir_path, function gotDirectory(err) {

			if (err) {
				return callback(err);
			}

			callback(null, new_dir_path);
		});
	});
});

/**
 * Create a directory
 *
 * @author   Mouneer
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}     target_dir
 * @param    {Function}   callback
 */
Peerpin.setMethod(function createDirectory(target_dir, callback) {

	var that = this,
	    init_dir,
	    base_dir,
	    pledge,
	    tasks = [],
	    sep   = libpath.sep;

	if (!callback) {
		callback = Fn.thrower;
	}

	// Get the starting directory
	init_dir = libpath.isAbsolute(target_dir) ? sep : '';

	// Get the base directory
	base_dir = '.';

	target_dir.split(sep).reduce(function(parent_dir, child_dir) {

		var cur_dir = libpath.resolve(base_dir, parent_dir, child_dir);

		// Don't create root map
		if (cur_dir == '/' || cur_dir == 'C:\\') {
			return cur_dir;
		}

		tasks.push(function(next) {

			fs.mkdir(cur_dir, function madeDir(err) {

				if (!err || err.code === 'EEXIST') {
					return next();
				}

				next(err);
			});
		});

		return cur_dir;
	}, init_dir);

	pledge = Fn.series(tasks, function done(err) {

		if (err) {
			return;
		}

		return true;
	});

	pledge.handleCallback(callback);

	return pledge;
});

/**
 * Store an identity
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Peer}       peer       The unverified peer
 * @param    {Function}   callback
 */
Peerpin.setMethod(function storePeer(peer, callback) {

	var that = this;

	Blast.setImmediate(function doImmediate() {

		if (typeof that.store_task == 'function') {
			return that.store_task(peer, callback);
		}

		callback(null);
	});
});

/**
 * Lookup an identity
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Peer}       peer       The unverified peer
 * @param    {Function}   callback
 */
Peerpin.setMethod(function lookupPeer(peer, callback) {

	var that = this;

	Blast.setImmediate(function doImmediate() {

		if (typeof that.lookup_task == 'function') {
			return that.lookup_task(peer, callback);
		}

		callback(null);
	});
});

/**
 * Get a free port
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number|Object}   options
 * @param    {Function}        callback
 */
Peerpin.setMethod(function getFreePort(options, callback) {

	var test_server,
	    port;

	if (typeof options == 'function') {
		callback = options;
		options = {};
	}

	if (!options) {
		options = {
			port: options
		};
	}

	// Get the port to test
	port = options.port;

	// Create a test server
	test_server = net.createServer();

	// Don't let script wait for test server
	test_server.unref();

	test_server.on('error', function onError() {

		if (port) {
			port++;
		}

		setImmediate(function tryAgain() {
			getFreePort(options, callback);
		});
	});

	if (!options.port) {
		test_server.listen(listening);
	} else {
		test_server.listen(options, listening);
	}

	function listening() {

		// Get the actual port
		port = test_server.address().port;

		// Close the server
		test_server.close(function closed() {
			callback(null, port);
		});
	}
});

/**
 * Lookup a claim transaction
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}       claim_db
 * @param    {String|Peer}  peer
 */
Peerpin.setMethod(function findClaimTransaction(claim_db, peer) {

	var db;

	if (Buffer.isBuffer(peer)) {
		peer = peer.toString('hex');
	}

	if (!peer) {
		throw new Error('Unable to lookup claim without peer information');
	}

	if (typeof peer == 'object') {
		peer = peer.public_key;
	}

	// Get the db
	db = this.blockchain.getClaimDb(claim_db);

	if (!db) {
		return null;
	}

	return db.get(peer);
});