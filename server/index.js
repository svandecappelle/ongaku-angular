const express = require('express'),
  path = require('path'),
  nconf = require('nconf'),
  nconfYaml = require('nconf-yaml'),
  bodyParser = require('body-parser'),
  cookieParser = require('cookie-parser'),
  errorhandler = require('errorhandler'),
  csrf = require('csurf'),
  // morgan = require('morgan'),
  winston = require('winston-color'),
  favicon = require('serve-favicon'),
  session = require('express-session'),
  yaml_config = require('node-yaml-config'),
  dateFormat = require('dateformat'),
  colors = require('colors'),

  config    = yaml_config.load(path.resolve(__dirname, './config/config.yml')),
  app = express();
var environment = process.env.NODE_ENV || 'development';

class Server {

  constructor () {
    this.running = false;
    nconf.file({
      file: path.resolve(__dirname, './config/application.yml'),
      format: nconfYaml
    });

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
    console.trace = logger.verbose;
    console.debug = logger.debug;
    console.silly = logger.silly;

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
  }

  initRoutes () {
    var routes = require('./app/routes');
    // redirect all others to the index (HTML5 history)
    routes.serve(app);
  }

}

var server = new Server();
