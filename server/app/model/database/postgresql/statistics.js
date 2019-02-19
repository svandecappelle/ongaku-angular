const nconf = require("nconf");
const { Statistics } = require("./models")

class StatisticsModel {

    constructor () {
    }

    set(name, id, time, value) {
        return Statistics.findOrCreate({
            where: {
                concern: id,
                time: time,
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

    get(name, id, filters) {
        const where = filters ? filters : {};
        where.name = name;
        if (id) {
            where.concern = id
        }
        return Statistics.findAll({
            where: where,
            raw: true
        }).then(results => {
            if (id && results.length == 1) {
                return results[0];
            }
            return results;
        });
    }

    getWithFilters(name, filters) {
        return this.get(name, undefined, filters);
    }

}

module.exports = StatisticsModel;