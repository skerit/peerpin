## 0.1.5 (WIP)

* Switch from deprected `datland-swarm-defaults` to `dat-swarm-defaults`
* Bump `protoblast`, `raw-socket` & `discovery-swarm` versions
* Add `test/example.js` script

## 0.1.4 (2018-04-22)

* Bump `discovery-swarm` to v5.1.1 for lots of important fixes

## 0.1.3 (2018-03-26)

* Fix getting ip address when no host info is available

## 0.1.2 (2018-03-17)

* Don't create root map "c:\"
* Emit added blocks on the `Blockchain` instance
* Add optional hole-punching code
* Add ability to save settings per identity
* Add prefixes to `SocketWrapper` buffers
* Throw an error when trying to compute a secret on an empty buffers
* Ignore connections coming from ourselves
* Wait for the `ready` event before letting an `Identity` connect

## 0.1.1 (2018-03-15)

* Add information about our ip & port
* Add `Identity#connecting_peer_count` property
* Add `Peerpin#number_of_connection_attempts` property
* Allow connecting using a preferred port (though discovery-swarm does not like this)
* Emit the `incoming_connection` event on the `Identity` class for possible incoming connections

## 0.1.0 (2018-03-11)

* Initial release