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

		// Settings saved by the administration and read through nconf
		await Promise.all(['deduplicate', 'uploadQuota'].map((key) => new Promise((resolve) => meta.settings.getOne('global', key, (err, value) => {
			if (!err && value !== null && value !== undefined) {
				nconf.set(key, value);
			}
			resolve();
		}))));
		await library.setupConnectors();
		downloader.watch();
		// Files changed in the music folders: read again alone, without a full scan
		require('./middleware/library-watcher').start().catch((err) => console.error('Cannot watch the music folders', err));

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
