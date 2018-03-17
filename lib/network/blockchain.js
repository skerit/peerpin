'use strict';

var Blockchain,
    ChainfulNS,
    PeerpinNS,
    Blast    = __Protoblast,
    fs       = require('fs'),
    Fn       = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

// Get the Chainful namespace
ChainfulNS = Fn.getNamespace('Develry.Chainful');

/**
 * The Blockchain class of Peerpin:
 * the link to Chainful's implementation
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Peerpin.Peerpin}   peerpin
 */
Blockchain = Fn.inherits('Informer', 'Develry.Peerpin', function Blockchain(peerpin) {

	// Reference to the peerpin network
	this.peerpin = peerpin;

	// The chainful instance
	this.chainful = new ChainfulNS.Chainful();

	// The difficulty should be set to 3
	// (= 3500-7000 attempts to mine a block)
	this.chainful.difficulty = 3;

	// Blocks that require broadcasting
	this.blocks_to_broadcast = [];

	// Claim data
	this.claims = {};

	// Possible highest index info
	this.length_votes = [];

	// Initialize the blockchain
	this.init();
});

/**
 * The length of the current chain
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {String}
 */
Blockchain.setProperty(function length() {
	return this.chainful.length;
});

/**
 * Get the highest voted length
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Number}
 */
Blockchain.setProperty(function voted_length() {
	var entry = this.length_votes[0];

	if (!entry) {
		return null;
	}

	return entry.length;
});

/**
 * Are we behind the network?
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @property  {Boolean}
 */
Blockchain.setProperty(function is_behind() {

	// If there is no voted length yet, then yes!
	if (!this.voted_length) {
		return true;
	}

	// If there is a voted length, and we're lower, than yet
	if (this.voted_length > this.length) {
		return true;
	}

	return false;
});

/**
 * Initialize the blockchain
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.2
 */
Blockchain.setCacheMethod(function init() {

	var that = this;

	/**
	 * Start loading the chain & data
	 */
	Fn.series(function loadExistingChain(next) {
		that.peerpin.getStorageDir('blockchain', function gotDir(err, dir_path) {

			if (err) {
				return next(err);
			}

			that.chainful.loadChain(dir_path, next);
		});
	}, function loadClaims(next) {
		that.loadClaims(next);
	}, function done(err) {

		if (err) {
			throw err;
		}

		// Ready to receive commands!
		that.emit('ready');
		that.peerpin.emit('blockchain_ready');

		// If the chain already has a length
		if (that.chainful.length) {
			that.emit('has_length', that.chainful.length);
			that.peerpin.emit('has_blocks', that.chainful.length);
		}
	});

	/**
	 * Set the block requester
	 */
	this.chainful.setBlockRequester(function getBlocks(requested_blocks, last_available_block, callback) {
		that.requestBlocks(requested_blocks, function gotBlocks(err, blocks) {
			callback(err, blocks);
		});
	});

	/**
	 * Set the block verifier (to verify the contents)
	 */
	this.chainful.setBlockVerifier(function verifyBlock(block, next) {

		var allow = true;

		if (block.index == 0) {
			return next();
		}

		if (block.transactions.length < 2) {
			return next(new Error('Blocks need to have at least 1 valid transaction'));
		}

		if (block.buffer.length > 1024) {
			return next(new Error('This block is too big: ' + block.buffer.length + ' bytes'));
		}

		block.transactions.forEach(function eachTransaction(transaction, index) {

			var claim_transaction,
			    data,
			    db;

			if (index == 0) {
				return;
			}

			data = transaction.data;

			if (data.type == 'value_claim') {
				// Get the claim db
				db = that.getClaimDb(data.db);

				// See if there already is a transaction
				claim_transaction = db.get(data.value) || db.get(data.value.toLowerCase());

				// If there is a claim, this block is invalid
				if (claim_transaction && !claim_transaction.equals(transaction)) {
					allow = false;
				}

				// See if this owner already has a claim in this db
				claim_transaction = db.get(data.owner_hex);

				if (claim_transaction && !claim_transaction.equals(transaction)) {
					allow = false;
				}
			}
		});

		if (!allow) {
			return next(new Error('This block did not pass peerpin verification'));
		}

		next();
	});

	/**
	 * Save the chain when new blocks are added
	 */
	this.chainful.on('added_block', function addedBlock(block) {

		// Emit the added block on the Blockchain instance
		that.emit('added_block', block);

		if (!that.peerpin.storage_dir) {
			return;
		}

		that.saveChain();
	});
});

/**
 * Mine the genesis block as the given identity
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Blockchain.setAfterMethod('ready', function createChain(identity, callback) {

	var that = this;

	Fn.series(function checkData(next) {

		if (!identity.private_key) {
			return callback(new Error('Can not create chain when no private key is set'));
		}

		// There can't be a chain in place
		if (that.chainful.length > 0) {
			return callback(new Error('Can not create chain when there are blocks on it'));
		}

		// This network needs to have a name
		if (!that.peerpin.name) {
			return callback(new Error('Can not create a new chain without a network name'));
		}

		next();
	}, function createChain(next) {

		var transaction;

		// Make sure there are no other pending transactions
		that.chainful.pending_transactions = [];

		// Create the initial transaction defining its name
		transaction = that.chainful.createTransaction({
			peerpin_network: that.peerpin.name
		});

		// Mine the block!
		that.chainful.createGenesisBlock(identity.private_key_buffer, identity.public_key_buffer, function gotBlock(err, block) {

			if (err) {
				return next(err);
			}

			// Add the block to the chain
			that.chainful.addBlock(block);

			console.info('Mined the genesis block:', block.hash_string);

			that.emit('has_length', that.chainful.length);
			that.peerpin.emit('has_blocks', that.chainful.length);

			next();
		});
	}, function storeChain(next) {
		that.saveChain(next);
	}, callback);
});

/**
 * Save the chain
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
Blockchain.setAfterMethod('ready', function saveChain(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	this.once('saved_chain_result', callback);
	this._saveChain();
});

/**
 * Save the chain, throttled.
 * At most once every 2 seconds
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Blockchain.setMethod('_saveChain', Fn.throttle(function _saveChain() {

	var that = this;

	this.peerpin.getStorageDir('blockchain', function gotDir(err, dir_path) {

		if (err) {
			return that.emit('saved_chain_result', err);
		}

		that.chainful.storeChain(dir_path, function stored(err) {

			if (err) {
				return that.emit('saved_chain_result', err);
			}

			return that.emit('saved_chain_result', null);
		});
	});
}, 2000));

/**
 * Request blocks from peers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Array}      block_indexes
 * @param    {Function}   callback
 */
Blockchain.setAfterMethod('ready', function requestBlocks(block_indexes, callback) {

	var that = this,
	    identity = this.peerpin.identities[0],
	    errors = [],
	    blocks = {},
	    i = 0;

	if (!identity) {
		return Blast.nextTick(callback);
	}

	Fn.while(function test() {

		var found = 0,
		    j = 0;

		for (j = 0; j < block_indexes.length; j++) {
			if (blocks[block_indexes[j]]) {
				found++;
			}
		}

		// If we found all indexes, stop requesting from peers
		if (found == block_indexes.length) {
			return false;
		}

		return i < identity.peers.length;
	}, function task(next) {
		var peer = identity.peers[i],
		    timebomb;

		// Make sure next is only called once
		next = Fn.regulate(next);

		// Increase peer index for next iteration
		i++;

		// Create the bomb
		timebomb = Fn.timebomb(5000, function timeout() {
			return next();
		});

		peer.talk('block_requests', block_indexes, function gotResponse(err, response) {

			var tasks;

			timebomb.defuse();

			if (err) {
				errors.push(err);
				return next();
			}

			tasks = [];

			response.forEach(function eachBlockBuffer(buffer) {
				tasks.push(function parseBuffer(next) {
						var block = ChainfulNS.Block.fromBuffer(buffer, that.peerpin.blockchain.chainful, null, function gotBuffer(err) {
							if (err) {
								return next(err);
							}

							blocks[block.index] = block;
							next();
						});
				});
			});

			Fn.parallel(4, tasks, function done(err) {

				if (err) {
					errors.push(err);
					return next();
				}

				next();
			});
		});
	}, function done(err) {

		if (err) {
			return callback(err);
		}

		// Get the values of the blocks object as an array
		blocks = values(blocks);

		if (blocks.length == 0) {
			if (errors) {
				return callback(errors);
			} else {
				return callback(new Error('Failed to get any block from the network'));
			}
		}

		callback(null, blocks);
	});
});

/**
 * Broadcast a block to other peers
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block        The block to add
 * @param    {String}                   type         "block" or "new_block"
 * @param    {Develry.Peerpin.Peer}     from_peer    The optional peer it came from
 */
Blockchain.setAfterMethod('ready', function broadcastBlock(block, type, from_peer) {

	var that = this,
	    tasks = [];

	if (typeof type == 'object') {
		from_peer = type;
		type = 'block';
	}

	if (!type) {
		type = 'block';
	}

	this.peerpin.identities.forEach(function eachIdentity(identity) {
		identity.peers.forEach(eachPeer);
	});

	// Function to do the adding to the task
	function eachPeer(peer) {

		if (peer.propablyHasBlock(block)) {
			return;
		}

		tasks.push(function sendToPeer(next) {
			peer.sendBlock(block, type, next);
		});
	}

	if (!tasks.length) {
		this.blocks_to_broadcast.push(block);
		return;
	}

	Fn.parallel(4, tasks, function done(err, result) {

		if (err) {
			console.error('Error broadcasting block:', err);
			return;
		}

		console.log('Broadcast block', block.index, 'to', tasks.length, 'peers:', err, result);
	});
});

/**
 * We received a "new" block from another peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Peerpin.Peer}     peer         The peer we received it from
 * @param    {Develry.Chainful.Block}   block        The block to add
 * @param    {Boolean}                  deemed_new   The peer thinks this is a new block
 */
Blockchain.setAfterMethod('ready', function receivedPeerBlock(peer, block, deemed_new) {

	var that = this,
	    received_count = peer.getBlockReceivedAmount(block);

	if (received_count == null) {
		return;
	}

	if (received_count > 0) {
		return;
	}

	this.chainful.proposeBlock(block, function proposeResult(err, result) {

		if (err) {
			return;
		}

		// Remember we already got this block from this peer
		peer.increaseBlockReceivedAmount(block);

		// Process the block
		that.processBlock(block);

		// Forward this block if it is "new"
		if (deemed_new) {
			that.broadcastBlock(block, 'new_block');
		}

		// Resolve possible conflicts
		that.peerpin.blockchain.chainful.resolveConflicts();
	});
});

/**
 * Add data to the chain & broadcast
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}     transaction_data
 * @param    {Buffer}     private_key
 * @param    {Function}   callback
 */
Blockchain.setAfterMethod('ready', function addDataToChain(transaction_data, private_key, callback) {

	var that = this,
	    transaction;

	if (!transaction_data) {
		return Blast.nextTick(callback, null, new Error('No data was provided to add'))
	}

	transaction = this.chainful.addTransaction(transaction_data, private_key);

	this.chainful.minePendingTransactions(private_key, function done(err, block) {

		if (err) {
			return callback(err);
		}

		// Add our new block to the chain!
		that.chainful.addBlock(block);

		// Process the block we just made
		that.processBlock(block);

		// Broadcast it!
		that.broadcastBlock(block, 'new_block');

		callback(err, block);
	});
});

/**
 * Get a claim database
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}    name
 * @param    {Boolean}   reset   Clear the db
 */
Blockchain.setMethod(function getClaimDb(name, reset) {

	var db;

	db = this.claims[name];

	if (!db || reset) {
		db = new Map();
		this.claims[name] = db;
	}

	return db;
});

/**
 * Process a block
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Block}   block
 */
Blockchain.setMethod(function processBlock(block) {
	var that = this;

	block.transactions.forEach(function eachTransaction(transaction, index) {

		// Skip the miner transaction
		if (index == 0) {
			return;
		}

		that.processBlockTransaction(transaction);
	});
});

/**
 * Add claims in a transaction
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Develry.Chainful.Transaction}   transaction
 */
Blockchain.setMethod(function processBlockTransaction(transaction) {

	var that = this,
	    config,
	    claim,
	    db;

	if (transaction.data.type == 'value_claim') {
		claim = transaction.data;

		// Get the claim "database"
		db = that.getClaimDb(claim.db);

		// Set the claim under the value
		db.set(claim.value, transaction);

		// And set under the owner
		db.set(transaction.owner_hex, transaction);
	}
});

/**
 * Load claims from the chain
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
Blockchain.setMethod(function loadClaims(callback) {

	var that = this;

	// Reset all the claim dbs
	this.claims = {};

	this.chainful.chain.blocks.forEach(function eachBlock(block) {
		that.processBlock(block);
	});

	Blast.nextTick(callback);
});

/**
 * Vote for a certain length,
 * but ignore if our length is bigger
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Number}   length
 * @param    {Peer}     peer
 */
Blockchain.setMethod(function voteForLength(length, peer) {

	var entry,
	    i;

	// Remove this peer from all other votes
	for (i = 0; i < this.length_votes.length; i++) {
		entry = this.length_votes[i];
		entry.votes.delete(peer);
	}

	// Try to get the entry
	entry = Blast.Bound.Array.findByPath(this.length_votes, 'length', length);

	// If it doesn't exist, create it
	if (!entry) {
		entry = {
			length : length,
			votes  : new Map()
		};

		this.length_votes.push(entry);
	}

	// Add the peer
	entry.votes.set(peer, true);

	// And sort the votes by their map size
	Blast.Bound.Array.sortByPath(this.length_votes, -1, 'votes.size');

	// As soon as we receive the first vote, emit it
	this.emitOnce('first_length_vote', length);
});

/**
 * Start listener to a certain peer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Peer}   peer
 */
Blockchain.setMethod(function initPeer(peer) {

	var that = this;

	/**
	 * This peer is requesting some blocks
	 *
	 * @param    {Array}      block_indexes
	 * @param    {Function}   callback
	 */
	peer.onTalk('block_requests', function obr(block_indexes, callback) {

		var blocks = [],
		    block,
		    i;

		if (!Array.isArray(block_indexes)) {
			return callback(new Error('Invalid block index request'));
		}

		for (i = 0; i < block_indexes.length; i++) {
			block = that.chainful.getByIndex(block_indexes[i]);

			if (block) {
				blocks.push(block.buffer);
			}
		}

		// Callback with the block buffers
		callback(null, blocks);
	});

	/**
	 * This peer is requesting the state of our chain
	 *
	 * @param    {Number}     their_length
	 * @param    {Function}   callback
	 */
	peer.onTalk('chain_state', function ocs(their_length, callback) {

		var our_length = that.length,
		    indexes = [],
		    i;

		that.voteForLength(their_length, peer);

		if (our_length < their_length) {
			for (i = our_length; i < their_length; i++) {
				indexes.push(i);
			}

			that.requestBlocks(indexes, function gotBlocks(err, blocks) {

				if (err) {
					return console.error('Error requesting blocks: ' + err);
				}

				peer.emit('chain_state_response', blocks);

				that.chainful.proposeBlocks(blocks).then(function() {
					that.chainful.resolveConflicts();
				});
			});
		}

		callback(null, our_length);
	});

});

/**
 * Load claims from the chain
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
function values(object) {

	var result,
	    key;

	if (Object.values) {
		result = Object.values(object);
	} else {
		result = [];

		for (key in object) {
			result.push(object[key]);
		}
	}

	return result;
}