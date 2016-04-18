//
// Copyright 2016 Joyent, Inc.  All rights reserved.
//
// This is the common set of functions for things like ensuring we have a
// SmartOS and Ubuntu image to work with.
//

process.env['TAP'] = 1;
var async = require('/usr/node/node_modules/async');
var cp = require('child_process');
var fs = require('fs');
var VM = require('/usr/vm/node_modules/VM');

var DEFAULT_ZFS_PROPERTIES = {
  "type": "filesystem",
  "compressratio": "1.00x",
  "mounted": "yes",
  "reservation": "0",
  "recordsize": "131072",
  "sharenfs": "off",
  "checksum": "on",
  "compression": "off",
  "atime": "off",
  "devices": "off",
  "exec": "on",
  "setuid": "on",
  "readonly": "off",
  "zoned": "off",
  "snapdir": "hidden",
  "aclmode": "discard",
  "aclinherit": "restricted",
  "canmount": "on",
  "xattr": "on",
  "copies": "1",
  "utf8only": "off",
  "normalization": "none",
  "casesensitivity": "sensitive",
  "vscan": "off",
  "nbmand": "off",
  "sharesmb": "off",
  "primarycache": "all",
  "secondarycache": "all",
  "logbias": "latency",
  "dedup": "off",
  "mlslabel": "none",
  "sync": "standard",
  "refcompressratio": "1.00x",
  "redundant_metadata": "all"
};
var IMAGES_SOURCE = 'https://images.joyent.com/';

exports.CURRENT_DOCKER_ALPINE_UUID = process.env['DOCKER_ALPINE_UUID'];
exports.CURRENT_SMARTOS_UUID = '01b2c898-945f-11e1-a523-af1afbe22822';
exports.CURRENT_UBUNTU_UUID = '71101322-43a5-11e1-8f01-cf2a3031a7f4';
exports.CURRENT_UBUNTU_NAME = 'ubuntu-10.04';
exports.CURRENT_UBUNTU_SIZE = 5120;

exports.on_new_vm = function(t, uuid, payload, state, fnlist, callback)
{
    if (payload.hasOwnProperty('brand') && !state.hasOwnProperty('brand')) {
        state.brand = payload.brand;
    }

    if ((['joyent', 'joyent-minimal', 'lx'].indexOf(state.brand) !== -1)
        && (!payload.hasOwnProperty('image_uuid'))) {

        payload.image_uuid = uuid;
    }

    functions = [
        function(cb) {
            VM.create(payload, function (err, obj) {
                if (err) {
                    state.create_err = err;
                    if (state.expect_create_failure) {
                        if (obj) {
                            state.vminfo = obj;
                            if (obj.uuid) {
                                state.uuid = obj.uuid;
                            }
                        }
                        t.ok(true, 'failed to create VM: ' + err.message);
                        cb();
                    } else {
                        t.ok(false, 'error creating VM: ' + err.message);
                        cb(err);
                    }
                } else if (state.expect_create_failure) {
                    state.vminfo = obj;
                    state.uuid = obj.uuid;
                    t.ok(false, 'create succeeded when expected failure.');
                    cb();
                } else {
                    state.vminfo = obj;
                    state.uuid = obj.uuid;
                    t.ok(true, 'created VM: ' + state.uuid);
                    cb();
                }
            });
        }
    ];

    if (fnlist && fnlist.length > 0) {
        functions = functions.concat(fnlist);
    }

    functions.push(function (cb) {
        if (state.hasOwnProperty('uuid')) {
            VM.delete(state.uuid, function (err) {
                if (err) {
                    if (err.message.match(/No such zone configured/)) {
                        t.ok(true, 'tried to delete VM ' + state.uuid
                            + ' but it was already gone.');
                    } else {
                        t.ok(false, 'error deleting VM: ' + err.message);
                    }
                } else {
                    t.ok(true, 'deleted VM: ' + state.uuid);
                }
                cb();
            });
        } else {
            // we didn't create a VM, don't also fail deleting.
            cb();
        }
    });

    functions.push(function (cb) {
        cb();
    });

    async.series(functions, function (err) {
        var openThingies;

        if (err) {
            t.ok(false, err.message);
        }
        if (callback) {
            // up to caller to call t.end!
            return callback();
        } else {
            t.end();

            /*

            // Helpful bit from Isaac that tells what's still open.
            openThingies = process._getActiveHandles();
            console.dir(openThingies);

            */
        }
    });
};

exports.checkDefaultZfsProperties =
function checkDefaultZfsProperties(t, dataset, message, callback) {
    var args;
    var cmd = '/usr/sbin/zfs';

    args = [
        'get', '-H', '-p', '-o', 'property,value', 'all', dataset
    ];

    cp.execFile(cmd, args, function (err, stdout, stderr) {
        var props = {};
        var propsList;

        if (err) {
            callback(err);
            return;
        }

        propsList = stdout.trim().split('\n');

        propsList.forEach(function (prop) {
            var p = prop.split('\t');
            // only include properties whose values we want to check
            if (DEFAULT_ZFS_PROPERTIES.hasOwnProperty(p[0])) {
                props[p[0]] = p[1];
            }
        });

        t.deepEqual(props, DEFAULT_ZFS_PROPERTIES, message);

        callback();
    });
};
