const async = require("async");

const library = require("./middleware/library");

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
		var q = async.queue((task, callback) => {
			console.info("Launch task: ".concat(task.name));
			callback();
		});

		q.drain = () => {
			console.info("All tasks have been processed.");
		};

		q.push({name: 'scan'}, (err) => {
			this.reload();
		});
	}
	
	reload () {
		return new Promise( (resolve, reject) => {
			library.scan().then(() => {
				library.scanProgress = false;
				console.info("Library fully scanned");
				resolve();
			});
		});
	}
}

module.exports = new Application();
