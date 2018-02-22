var Peerpin,
    Blast;

// Get an existing Protoblast instance,
// or create a new one
if (typeof __Protoblast != 'undefined') {
	Blast = __Protoblast;
} else {
	Blast = require('protoblast')(false);
}

// Get the Peerpin namespace
Peerpin = Blast.Bound.Function.getNamespace('Develry.Peerpin');

require('./network/peerpin.js');
require('./network/common.js');
require('./network/identity.js');
require('./network/peer.js');

// Export the Peerpin namespace
module.exports = Blast.Classes.Develry.Peerpin;