const nconf = require("nconf");
const logger = require('log4js').getLogger('Server');
const async = require("async");

//const middleware = require('./middleware/middleware');
// const library = require("./middleware/library");

//const communication = require('./communication');
//const meta = require('./meta');


let instance = null;

class Application {
	constructor () {
		if( !instance ) {
			instance = this;
		}
		return instance;
	}

	start () {
		// const library = require("./middleware/library");
		/*var q = async.queue((task, callback) => {
			logger.info("Launch task: ".concat(task.name));
			callback();
		});

		q.drain = () => {
			logger.info("All tasks have been processed.");
		};

		q.push({name: 'scan'}, (err) => {
			this.reload();
		});*/
	}
	
	reload (callback) {
		/*library.scan(() => {
			library.scanProgress = false;
			logger.info("Library fully scanned");
			if (callback){
				callback();
			} else {
				this.emit('library:scanned', {message: "Library scanned"});
			}
		});*/
	}
}

module.exports = new Application();
