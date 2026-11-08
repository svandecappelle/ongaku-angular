const path = require('path');
const express = require('express');
const nconf = require('nconf');
const semver = require('semver');
const models = require('../models');
const api = require('./api');
const install = require('./install');
const upgrade = require('./upgrade');
const authentication = require('./authentication');
const sessionGuard = require('../middleware/session-guard');
const guards = require('../middleware/guards');
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

    // The sessions of the accounts disabled or deleted since their login end here
    app.use('/api', sessionGuard.middleware());
    // Login required everywhere but the authentication, the installation and the stream
    app.use('/api', guards.api());

    // DESACTIVATED DUE TO Postgresql is not yet fonctionnal
    app.use('/api/install', install);
    // Updates the code (git) and the database: administrators only
    app.use('/api/upgrade', guards.requireAdministrator, upgrade);



    try {
      app.use('/api', api);
    } catch(err) {
      console.error(err);
    }

    authentication.initialize(app);
    authentication.load();
    // An unknown API route is a JSON 404, not the page of the application
    app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

    // app.use('/api/auth', authority);
    app.use('/static', express.static(path.join(__dirname, '../../../public')));
    app.use(express.static(path.join(__dirname, '../../../client/dist')));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(__dirname, '../../../client/dist/index.html'));
    });

    // Last: the errors of every route and middleware (body too large, invalid JSON...).
    // The details stay in the server log; the client gets a short JSON message.
    app.use((err, req, res, next) => {
      const status = Number(err.status || err.statusCode) || 500;
      if (status >= 500) {
        console.error(`${req.method} ${req.originalUrl}`, err);
      }
      if (res.headersSent) {
        return next(err);
      }
      res.status(status).json({
        message: status >= 500 ? 'Internal server error' : (err.expose && err.message) || 'Bad request'
      });
    });
  }

  isPublic (url) {
    return this.routes.indexOf(url) !== -1;
  }

}

module.exports = new Routes();
