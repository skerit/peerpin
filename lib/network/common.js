'use strict';

var PeerpinNS,
    Common,
    Crypto   = require('crypto'),
    Blast    = __Protoblast,
    Raw,
    Fn       = Blast.Bound.Function;

// Get the Peerpin namespace
PeerpinNS = Fn.getNamespace('Develry.Peerpin');

try {
	Raw = require('raw-socket');
} catch (err) {
	console.warn('Raw socket not available for hole-punching:', err);
	// Ignore
}

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

/**
 * Send a SYN packet
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Number} dst_ip     destination ip as an integer
 * @param    {Number} dst_port   destination port
 * @param    {Number} src_ip     source ip as an integer
 * @param    {Number} src_port   source port
 */
Common.setMethod(function sendSYN(dst_ip, dst_port, src_ip, src_port) {

	var that = this,
	    id;

	if (!Raw) {
		return;
	}

	if (this._syn_errors > 10) {
		return;
	}

	// You'll need special permissions to use a socket like this,
	// otherwise it'll throw an error. If it does, just ignore it
	try {
		// Create a raw socket
		let sock = Raw.createSocket({
			protocol: Raw.Protocol.TCP
		});

		if (!src_ip) {
			src_ip = this.ip;
		}

		if (!src_port) {
			src_port = this.port;
		}

		if (!src_ip || !src_port) {
			throw new Error('A source ip & port is required!');
		}

		if (typeof dst_ip == 'string') {
			dst_ip = this.convertIpToInt(dst_ip);
		}

		if (typeof src_ip == 'string') {
			src_ip = this.convertIpToInt(src_ip);
		}

		id = that.convertIntToIp(dst_ip) + ':' + dst_port;

		if (!that._sent_syns) {
			that._sent_syns = {};
		}

		if (that._sent_syns[id]) {
			return;
		}

		that._sent_syns[id] = true;

		setTimeout(function clearSent() {
			that._sent_syns[id] = null;
		}, 30 * 1000);

		// A scaffolding TCP syn packet. Notice all zeroes except a few options.
		// The "few options" include setting the SYN flags.
		// Don't change it if you don't know what you're doing.
		let packet = new Buffer('0000000000000000000000005002200000000000', 'hex');

		// Need 4 random bytes as sequence. Needs to be random to avoid collision.
		// You can choose your own random source. I chose the crypto module.
		Crypto.randomBytes(4).copy(packet, 4);

		packet.writeUInt16BE(src_port, 0); // Write source port
		packet.writeUInt16BE(dst_port, 2); // Write destination port

		// Generate the pseudo header
		let header = this.generatePseudoHeader(src_ip, dst_ip, packet.length);

		// Generate checksum with utility function
		// using a pseudo header and the tcp packet scaffold
		let sum = Raw.createChecksum(header, packet);

		// writing the checksum back to the packet. Packet complete!
		packet.writeUInt16BE(sum, 16);

		// send packet with offset 0, length = packet.length, to the dstIP
		// The port data is in the packet already, so we don't worry about that during sending.
		sock.send(packet, 0, packet.length, dst_ip, function sent() {
			//console.log('sent TCP SYN to', that.convertIntToIp(dst_ip) + ':' + dst_port, 'from', that.convertIntToIp(src_ip) + ':' + src_port);

			if (!that._syn_sent) {
				that._syn_sent = 0;
			}

			that._syn_sent++;
		});
	} catch (err) {

		if (!this._syn_errors) {
			this._syn_errors = 0;
		}

		this._syn_errors++;
	}
});

/**
 * Generate a pseudo header
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {Number} src_ip              source ip as an integer
 * @param    {Number} dst_ip              destination ip as an integer
 * @param    {Number} tcp_packet_length   source port
 *
 * @return   {Buffer}                 the pseudo header
 */
Common.setMethod(function generatePseudoHeader(src_ip, dst_ip, tcp_packet_length) {

	// new buffer of length 12. The pseudo-header length
	var header = new Buffer(12);

	// Important to fill with zeroes. Node.js does not zero the memory before creating the buffer.
	header.fill(0);

	// write source ip, a 32 bit integer!
	header.writeUInt32BE(src_ip, 0);

	// write destination ip, a 32 bit integer!
	header.writeUInt32BE(dst_ip, 4);

	// specifies protocol. Here we write 6 for TCP. Other protocols have other numbers.
	header.writeUInt8(6, 9);

	// Write the TCP packet length of which we are generating a pseudo-header for. 
	// Does not include the length of the psuedo-header.
	header.writeUInt16BE(tcp_packet_length, 10);

	return header;
});

/**
 * Convert an IPv4 to an integer
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param    {String} ip   IP address as a string
 *
 * @return   {Number}
 */
Common.setMethod(function convertIpToInt(ip) {

	var pieces,
	    result;

	// Split the IP on the dots
	pieces = ip.split('.');

	result = pieces.reduce(function eachEntry(ip_int, octet) {
		return (ip_int << 8) + parseInt(octet, 10);
	}, 0);

	result = result >>> 0;

	return result;
});

/**
 * Parses Integer to IPv4
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.2
 * @version  0.1.2
 *
 * @param  {String}    value    value to parse
 *
 * @return {String}             IPv4 String of value provided
 */
Common.setMethod(function convertIntToIp(value) {

	var result;

	if (!value) {
		throw new Error('E_UNDEFINED_INTEGER');
	}

	result = /\d+/.exec(value);

	if (!result) {
		throw new Error('E_INTEGER_NOT_FOUND');
	}

	value = result[0];

	return [
		(value>>24)&0xff,
		(value>>16)&0xff,
		(value>>8)&0xff,
		value&0xff
	].join('.');
});