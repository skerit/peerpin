'use strict';

var PeerpinNS,
    Common,
    Blast    = __Protoblast,
    Fn       = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

/**
 * The Common class:
 * basis for our Identity and other Peers
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Common = Fn.inherits('Informer', 'Develry.Peerpin', function Common() {});

/**
 * A reference to the blockchain instance
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Develry.Peerpin.Blockchain}
 */
Common.setProperty(function blockchain() {
	return this.peerpin.blockchain;
});