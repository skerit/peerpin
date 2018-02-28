'use strict';

var libpath = require('path'),
    assert  = require('assert'),
    crypto  = require('crypto'),
    tmp     = require('tmp'),
    fs      = require('fs'),
    peerpin_from_ns,
    private_key,
    public_key,
    ChainfulNS,
    PeerpinNS,
    temp_dir,
    peerpin,
    Blast,
    main,
    ecdh;

ecdh = crypto.createECDH('secp256k1')
ecdh.generateKeys();

private_key = ecdh.getPrivateKey(null, 'compressed');
public_key = ecdh.getPublicKey(null, 'compressed');

// Make sure temporary files get cleaned up
tmp.setGracefulCleanup();

// Get a temp dir
temp_dir = tmp.dirSync({unsafeCleanup: true});

describe('Peerpin', function() {

	// There's lots of crypto work here, so it goes a bit slower than normal
	// Don't nag about it
	this.slow(3000);
	this.timeout(10000);

	it('should load the namespace correctly', function() {

		// Require via the main index.js
		PeerpinNS = require('../index.js');

		// The name of the namespace should be Chainful
		assert.equal(PeerpinNS.name, 'Peerpin', 'Namespace name does not match');

		// The namespace should be a link to the main class
		peerpin_from_ns = new PeerpinNS('peerpin-test');
		peerpin = new PeerpinNS.Peerpin('peerpin-test');

		// These 2 should have the same constructor
		assert.equal(peerpin_from_ns.constructor, peerpin.constructor, 'The namespace does not return the correct constructor');

		// See if the other classes are exported
		assert.equal(typeof PeerpinNS.Peer, 'function');
		assert.equal(typeof PeerpinNS.Identity, 'function');

		// Create a new network
		main = new PeerpinNS.Peerpin('peerpin-test');
	});

	describe('#setMainStorageDir(path, callback)', function() {
		it ('should set the main storage directory', function(done) {
			main.setMainStorageDir(temp_dir.name, function _done(err) {
				if (err) {
					throw err;
				}
				done();
			});
		});
	});

	describe('#createDirectory', function() {
		it('should create a directory recursively', function(done) {
			var new_path = libpath.join(temp_dir.name, 'test', 'longer', 'directory');
			main.createDirectory(new_path, function _done(err, result) {

				if (err) {
					throw err;
				}

				assert.equal(result, true);
				done();
			});
		});
	});
});

describe('Identity', function() {

	var identity;

	// There's lots of crypto work here, so it goes a bit slower than normal
	// Don't nag about it
	this.slow(3000);
	this.timeout(10000);

	describe('.constructor(peerpin)', function() {
		it('should create a new identity', function() {
			identity = new PeerpinNS.Identity(main);
		});
	});

	describe('#createKeys()', function() {
		it('should create new keys for use on the network', function() {
			identity.createKeys();

			assert.equal(Buffer.isBuffer(identity.private_key_buffer), true);
		});
	});

	describe('#connect()', function() {
		it('should throw an error when no keys are set', function(done) {
			var test = new PeerpinNS.Identity(main);

			test.connect(function _done(err) {
				assert.equal(!!err, true);
				done();
			});
		});

		it('should connect to the network', function() {
			identity.connect();
		});
	});

	describe('Blockchain#createChain(identity, callback)', function() {
		it('needs to be called when making a new chain', function(done) {
			main.blockchain.createChain(identity, function _done(err) {
				if (err) {
					throw err;
				}

				done();
			});
		});
	});

	describe('#claimValue(db, value)', function() {

		var test_name = 'test_name_' + Date.now(),
		    test_value = 'test_value_' + Date.now();

		it('should claim a value on the network', function(done) {
			identity.claimValue(test_name, test_value, function claimed(err, result) {

				if (err) {
					throw err;
				}

				done();
			});
		});

		it('should throw an error when the value already exists', function(done) {
			identity.claimValue(test_name, test_value, function claimed(err, result) {
				assert.equal(!!err, true);
				done();
			});
		});
	});
});

describe('Peer', function() {

	var second_connection,
	    second_identity,
	    test_peer;

	this.slow(3000);
	this.timeout(20000);

	before(function() {
		second_connection = new PeerpinNS.Peerpin('peerpin-test');
		second_identity = new PeerpinNS.Identity(second_connection);
		second_identity.createKeys();
	});

	describe('Identity `peer` event', function() {
		it('should be emitted when a peer connects', function(done) {

			var peer_count = 0;

			second_identity.connect();

			second_identity.on('peer', function onPeer(peer) {
				peer_count++;

				if (peer_count == 1) {
					test_peer = peer;
					done();
				}
			});
		});
	});

	describe('`verified` event', function() {
		it('should be emitted once the keys have been exchanged', function(done) {
			test_peer.afterOnce('verified', function() {
				done();
			});
		});
	});
});