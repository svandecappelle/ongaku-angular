const path = require('path');
const express = require('express');
const nconf = require('nconf');
const semver = require('semver');
const models = require('../models');
const users = require('./users');
const api = require('./api');
const groups = require('./groups');
const install = require('./install');
const upgrade = require('./upgrade');
const authentication = require('./authentication');
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

    // DESACTIVATED DUE TO Postgresql is not yet fonctionnal
    // app.use('/api/install', install);
    // app.use('/api/upgrade', upgrade);


    // app.use('/api/users', users);
    // app.use('/api/groups', groups);

    try {
      app.use('/api', api);
    } catch(err) {
      console.error(err);
    }

    authentication.initialize(app);
    authentication.load();

    // app.use('/api/auth', authority);
    app.use('/node_modules', express.static(path.join(__dirname, '../../../client/node_modules')));
    app.use('/static', express.static(path.join(__dirname, '../../../public')));
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
