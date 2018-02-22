var SwarmDefaults = require('datland-swarm-defaults'),
    PeerpinNS,
    Peerpin,
    Network,
    Blast = __Protoblast
    net   = require('net'),
    fs    = require('fs'),
    Fn    = Blast.Bound.Function;

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
 * Set a method that'll store peer data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   task
 */
Peerpin.setMethod(function setStoreTask(task) {
	this.store_task = task;
});

/**
 * Set a method that'll look for stored identity data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   task
 */
Peerpin.setMethod(function setLookupTask(task) {
	this.lookup_task = task;
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