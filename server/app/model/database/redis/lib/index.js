'use strict';

(function (module) {

    var nconf = require('nconf'),
        redis,
        redisClient;

    module.questions = [{
        name: 'redis:host',
        description: 'Host IP or address of your Redis instance',
        'default': nconf.get('redis:host') || '127.0.0.1'
    }, {
        name: 'redis:port',
        description: 'Host port of your Redis instance',
        'default': nconf.get('redis:port') || 6379
    }, {
        name: 'redis:password',
        description: 'Password of your Redis database',
        hidden: true
    }, {
        name: "redis:database",
        description: "Which database to use (0..n)",
        'default': nconf.get('redis:database') || 0
    }];

    module.init = function (callback) {
        try {
            redis = require('redis');
        } catch (err) {
            console.error('Unable to initialize Redis! Is Redis installed? Error :' + err.message);
            process.exit();
        }

        var redis_socket_or_host = nconf.get('redis:host');
        var db = parseInt(nconf.get('redis:database'), 10);
        var options = {
            // RESP2 keeps the reply format of the historical node_redis v2 API
            RESP: 2,
            database: db || 0
        };

        if (redis_socket_or_host && redis_socket_or_host.indexOf('/')>=0) {
            /* If redis.host contains a path name character, use the unix dom sock connection. ie, /tmp/redis.sock */
            options.socket = { path: redis_socket_or_host };
        } else {
            /* Else, connect over tcp/ip */
            options.socket = { host: redis_socket_or_host || '127.0.0.1', port: Number(nconf.get('redis:port')) || 6379 };
        }

        if (nconf.get('redis:password')) {
            options.password = nconf.get('redis:password');
        } else {
            console.warn('You have no redis password setup!');
        }

        var client = redis.createClient(options);

        client.on('error', function (err) {
            console.error(err, new Error());
        });

        client.connect().catch(function (error) {
            console.error("Ongaku could not connect to your Redis database. Redis returned the following error: " + error.message);
            process.exit();
        });

        redisClient = require('./compat')(client);

        module.client = redisClient;

        require('./main')(redisClient, module);
        require('./hash')(redisClient, module);
        require('./sets')(redisClient, module);
        require('./sorted')(redisClient, module);
        require('./list')(redisClient, module);

        if (typeof callback === 'function') {
            callback();
        }
    };

    module.close = function () {
        redisClient.quit();
    };

    module.helpers = module.helpers || {};
    module.helpers.redis = require('./helpers');
}(exports));
