const expect = require('chai').expect;
const moment = require('moment');
const { Sequelize } = require('../../../app/sql-models')
const { Op } = Sequelize;
const StatisticsModel = require('../../../app/model/statistics');

describe('Statistics', () => {
    it('create stat', (done) => {
        StatisticsModel.set('plays', 'id-song', 'something').then( () => {
            StatisticsModel.get('plays', 'id-song').then( (stat) => {
                expect(stat.value).to.be.equal('something');
                done();
            });
        });
    });

    it('init using increment stat', (done) => {
        StatisticsModel.set('plays', 'id-song-increment-init', 'increment').then( () => {
            StatisticsModel.get('plays', 'id-song-increment-init').then( (stat) => {
                expect(stat.value).to.be.equal('1');
                done();
            });
        });
    });

    it('increment stat', (done) => {
        StatisticsModel.set('plays', 'id-song-increment', 'increment').then( () => {
            StatisticsModel.set('plays', 'id-song-increment', 'increment').then(() => {
                StatisticsModel.get('plays', 'id-song-increment').then((stat) => {
                    expect(stat.value).to.be.equal('2');
                    done();
                });
            });
        });
    });

    it('decrement stat', (done) => {
        StatisticsModel.set('plays', 'id-song-decrement', 'decrement').then( () => {
            StatisticsModel.get('plays', 'id-song-decrement').then( (stat) => {
                expect(stat.value).to.be.equal('-1');
                done();
            });
        });
    });

    it('re-check stat', (done) => {
        StatisticsModel.get('plays', 'id-song').then( (stat) => {
            expect(stat.value).to.be.equal('something');
            done();
        });
    });

    it('get-stats-filtering-date', (done) => {
        StatisticsModel.getWithFilters('plays', {
            updated_at: {
                [Op.gte]: moment().startOf('day').toDate()
            }
        }).then(results => {
            expect(results).to.be.an('array');
            expect(results.length).to.be.equal(4);
            done();
        });
    })
});
