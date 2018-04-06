const path = require('path');
const express = require('express');
const nconf = require('nconf');
const semver = require('semver');
const models = require('../models');
const users = require('./users');
const groups = require('./groups');
const install = require('./install');
const upgrade = require('./upgrade');
const authority = require('./authority');
const version = require(path.resolve(__dirname, '../utils/version'));

class Routes {

  constructor () {
    this.routes = ['/login', '/install'];
  }

  serve (app) {
    app.all('/install', (req, res, next) => {
      version.check().then( (version) => {
        if (version.installed){
          console.log('redirect');
          res.redirect('/');
        } else {
          next();
        }
      });
    });

    console.log('checking install');
    version.check().then( (version) => {
      console.log(`installed version is ${version.installed}`);
    }).catch((err) => {
      console.log('Error on checking installation', err);
    });

    app.use('/api/install', install);
    app.use('/api/upgrade', upgrade);

    app.use('/api/users', users);
    app.use('/api/groups', groups);

    app.use(authority);

    app.use(express.static(path.join(__dirname, '../../../client/dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../../client/dist/index.html'));
    });
  }

  isPublic (url) {
    return this.routes.indexOf(url) !== -1;
  }

}

module.exports = new Routes();
