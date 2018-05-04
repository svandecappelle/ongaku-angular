/*jslint node: true */
"use strict";

var nconf = require('nconf'),
    ALLOWED_MODULES = ['hash', 'list', 'sets', 'sorted'];

var primaryDB = require(`./redis`);

primaryDB.init( () => {
    console.info("well done configured database");
});

module.exports = primaryDB;