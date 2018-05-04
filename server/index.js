const express = require('express');
const path = require('path');
const nconf = require('nconf');
const nconfYaml = require('nconf-yaml');
const winston = require('winston-color');

var logger = new Winston.Logger({
  transports: [
      new Winston.transports.Console({
          level: nconf.get('log-level'),
          handleExceptions: true,
          json: false,
          timestamp: function() {
            return dateFormat();
          },
          formatter: function(options) {
            // Return string will be passed to logger.
            return `${options.timestamp().green} [${options.level.toUpperCase().yellow}][${environment.red}] - ${(options.message ? options.message : '')} ${(options.meta && Object.keys(options.meta).length ? '\n'+ JSON.stringify(options.meta, null, ' ') : '' )}`;
          }
      })
  ]
});

console.error = logger.error;
console.warn = logger.warn;
console.log = logger.info;
console.info = logger.info;
console.trace = logger.verbose;
console.debug = logger.debug;
console.silly = logger.silly;

nconf.file({
  file: path.resolve(__dirname, './config/application.yml'),
  format: nconfYaml
});

const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const errorhandler = require('errorhandler');
const csrf = require('csurf');
  // morgan = require('morgan'),
const favicon = require('serve-favicon');
const session = require('express-session');
const yaml_config = require('node-yaml-config');
const dateFormat = require('dateformat');
const colors = require('colors');

  config    = yaml_config.load(path.resolve(__dirname, './config/config.yml')),
  app = express();
var environment = process.env.NODE_ENV || 'development';

var application = require('./app/index');

class Server {

  constructor () {
    this.running = false;
    // application is full angular now
    // this.initViewEngine();
    this.initExpressMiddleWare();
    this.initRoutes();
    this.start();
  }

  status () {
    console.log(`STATUS started: ${this.running ? 'on' : 'off'}`);
  }

  start () {
    app.listen(config.port, (err) => {

      this.running = !err;
      if (err) {
        console.error('Error loading server: ', err);
      } else {
        console.log('Listening on http://localhost:%d', config.port);
      }
    });
  }

  initViewEngine () {
    app.set('view engine', 'pug');
    app.set('views', path.resolve(__dirname, './app/views'));
  }

  initExpressMiddleWare () {
    // app.use(morgan('dev'));
    winston.level = nconf.get('log-level');
    app.use((req, res, next) => {
      console.trace(`${req.method} -> ${req.url}`);
      next();
    });
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(errorhandler());
    app.use(cookieParser());
    if (app.get('env') === 'production') {
      app.set('trust proxy', 1) // trust first proxy
      // sess.cookie.secure = true // serve secure cookies
    }

    // TODO change secret value  and maybe use passport
    app.use(session({
      secret: 'keyboard cat',
      cookie: {}
    }))

    /*
    app.use(csrf({ cookie: true }));
    /*
    app.use((req, res, next) => {
      var csrfToken = req.csrfToken();
      res.locals._csrf = csrfToken;
      res.cookie('XSRF-TOKEN', csrfToken);
      next();
    });
    */

    process.on('uncaughtException', (err) => {
      if (err) console.log(err, err.stack);
    });

    process.on('unhandledRejection', (reason, p) => {
      console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
      // application specific logging, throwing an error, or other logic here
    });
  }

  initRoutes () {
    var routes = require('./app/routes');
    // redirect all others to the index (HTML5 history)
    routes.serve(app);
    
    application.start();
    
    
  }

}

var server = new Server();
