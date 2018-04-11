/*jslint node: true */
"use strict";

var nconf = require('nconf'),
    async = require('async'),
    ALLOWED_MODULES = ['hash', 'list', 'sets', 'sorted'];

var primaryDB = require(`./redis`);

primaryDB.init(function () {
    console.info("well done configured database");
});

module.exports = primaryDB;