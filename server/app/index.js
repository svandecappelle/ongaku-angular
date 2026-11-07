const async = require("async");
const nconf = require("nconf");

const library = require("./middleware/library");
const downloader = require("./middleware/downloader");


const meta = require('./meta');


let instance = null;

class Application {
	constructor() {
		if (!instance) {
			instance = this;
		}
		return instance;
	}

	async start() {

		// Saved by the administration; enabled by default
		await new Promise((resolve) => meta.settings.getOne('global', 'deduplicate', (err, value) => {
			if (!err && value !== null && value !== undefined) {
				nconf.set('deduplicate', value);
			}
			resolve();
		}));
		await library.setupConnectors();
		downloader.watch();

		var q = async.queue((task, callback) => {
			console.info("Launch task: ".concat(task.name));
			callback();
		});

		q.drain(() => {
			console.info("All tasks have been processed.");
		});

		q.push({
			name: 'scan'
		}, (err) => {
			this.reload();
		});
	}

	reload() {
		return new Promise((resolve, reject) => {
			library.scan().then(() => {
				library.scanProgress = false;
				console.info("Library fully scanned");
				resolve();
			});
		});
	}
}

module.exports = new Application();
