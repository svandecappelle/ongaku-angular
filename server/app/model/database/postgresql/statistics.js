const nconf = require("nconf");
const { Statistics } = require("./models")

class StatisticsModel {

    constructor () {
    }

    set(name, id, value, callback) {
        return Statistics.findOrCreate({
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
        });
    }

    get(name, id, callback) {
        return Statistics.findOne({
            where: {
                'name': name,
                'concern': id
            },
            raw: true
        });
    }
}

module.exports = StatisticsModel;