'use strict';

// Not meant to be used as a unit test
if (typeof describe == 'function') {
	return;
}

// The actual Peerpin namespace/constructor
const Peerpin = require('../index.js');

// The os built-in module, just needed to get the hostname
const os = require('os');

// The 'tmp' module, used for creating a temporary directory
const tmp = require('tmp');

// Make sure temporary files get cleaned up
tmp.setGracefulCleanup();

// Get a temp dir
let temp_dir = tmp.dirSync({unsafeCleanup: true});

// The name of the test network can be defined as an argument,
// or defaults to the current hostname
let name = process.argv[2] || os.hostname();

// Construct the full test network name
// We don't want something completely random here because
// the test client script needs to use the same name, obviously
let test_network_name = 'peerpin-test-' + name;

console.log('Going to connect to network ' + test_network_name);

// Finally: create a connection to the network
let network = new Peerpin(test_network_name);

// It needs to store some information to disk, use a temp directory for that
network.setMainStorageDir(temp_dir.name);

// Create a new identity, a "profile" as it were
// It needs to know which network it belongs to
let identity = new Peerpin.Identity(network);

console.log('Created new identity, going to generate keys');

// Each identity needs a private & public key.
// For this test it's easiest to just let it create some random ones
identity.createKeys();

console.log('Generated identity public key', identity.public_key);

// Now make the identity connect to the network
// The callback is executed if everything went OK (or not, but then with an error)
// It does not mean it's connected to other clients yet
identity.connect(function finished(err) {
	console.log('Finished initializing identity connection');
});

// Listen for new peers
identity.on('peer', function onPeer(peer) {

	console.log('');
	console.log('Made connection to peer', peer.public_key);

	// Listen for peer messages
	peer.onTalk('chat', function onChat(message, respond) {

		console.log('');
		console.log('[' + peer.public_key + '] says:', message);

		// The public_mnemonic is just the public_key in a mnemonic
		// representation, I'm just using it here to say something random
		let response = identity.public_mnemonic.split(' ').slice(0, 2).join(' ');

		console.log('  »» Responding with "' + response + '"');
		console.log('');

		respond(null, response);
	})

	let opener = 'Hello there @ ' + Date.now();
	console.log('Saying "' + opener + '"');

	// Say hello
	peer.talk('chat', opener, function gotResponse(err, response) {
		console.log('[' + peer.public_key + '] responds:', response);
	});
});