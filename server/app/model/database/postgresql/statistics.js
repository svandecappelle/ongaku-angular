const nconf = require("nconf");
const { Statistics } = require("./models")

class StatisticsModel {

    constructor () {
    }

    set(name, id, value, callback) {
        Statistics.findOrCreate({
            where: {
                concern: id,
                name: name
            }, defaults: {
                value: '0'
            }
        }).then((stats) => {
            const stat = stats[0];
            if (['increment', 'decrement'].indexOf(value) !== -1) {
                const curVal = parseInt(stat.value);
                const newVal = value === 'increment' ? curVal + 1 : curVal - 1;
                stat.value = value === 'increment' ? curVal + 1 : curVal - 1
                return Statistics.update({
                        value: newVal
                    }, {
                    where: {
                        concern: id,
                        name: name
                    }
                });
            } else {
                return Statistics.update({
                    value: value
                }, {
                    where: {
                        concern: id,
                        name: name
                    }
                });
            }
        }).then(callback)
        .catch((error) => {
            console.error(error);
            callback(error);
        });
    }

    get(name, id, callback) {
        Statistics.findOne({
            where: {
                'name': name,
                'concern': id
            },
            raw: true
        }).then((stats) => {
            callback(stats);
        }).catch((error) => {
            console.error(error);
            callback(error);
        });
    }
}

module.exports = StatisticsModel;