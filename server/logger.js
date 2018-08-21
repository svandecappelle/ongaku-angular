const nconf = require('nconf');
const util = require('util');
const dateFormat = require('dateformat');
const { createLogger, format, transports } = require('winston');
var environment = process.env.NODE_ENV || 'development';


// time format of log
const timestamp2 = function () {
  return dateFormat();
};
// Colorise level output
const level = (value) => {
  switch (value.toUpperCase()) {
    case 'SILLY':
    case 'DEBUG':
      return value.toUpperCase().white;
    case 'WARN':
      return value.toUpperCase().yellow;
    case 'ERROR':
      return value.toUpperCase().red;
    default:
      return value.toUpperCase().blue;
  }
};

// log format
const myFormat = format.printf((info) => {
  let output = `${timestamp2().green} `;
  output += `[${level(info.level)}][${environment.red}] `;
  output += `${(info.message ? info.message : '')}`;
  return output;
});

// Winston logger
const logger = createLogger({
  transports: [
    new transports.Console({
      level: nconf.get('log-level'),
      handleExceptions: true,
      humanReadableUnhandledException: true,
      json: false,
      colorize: true,
      format: myFormat
    })
  ]
});

function formatArgs(args) {
  return [util.format.apply(util.format, Array.prototype.slice.call(args))];
}
console.withoutFormat = console.log;
console.log = function () {
  logger.info(...formatArgs(arguments));
};
console.info = function () {
  logger.info(...formatArgs(arguments));
};
console.warn = function () {
  logger.warn(...formatArgs(arguments));
};
console.error = function () {
  logger.error(...formatArgs(arguments));
};
console.debug = function () {
  logger.debug(...formatArgs(arguments));
};
console.trace = function () {
  logger.verbose(...formatArgs(arguments));
};
console.verbose = function () {
  logger.verbose(...formatArgs(arguments));
};
console.silly = function () {
  logger.silly(...formatArgs(arguments));
};
