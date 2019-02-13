const expect = require('chai').expect;
const StatisticsModel = require('../../../app/model/statistics');

describe('Statistics', () => {
    it('create stat', (done) => {
        StatisticsModel.set('plays', 'id-song', 'something', () => {
            StatisticsModel.get('plays', 'id-song', (stat) => {
                expect(stat.value).to.be.equal('something');
                done();
            });
        });
    });

    it('init using increment stat', (done) => {
        StatisticsModel.set('plays', 'id-song-increment-init', 'increment', () => {
            StatisticsModel.get('plays', 'id-song-increment-init', (stat) => {
                expect(stat.value).to.be.equal('1');
                done();
            });
        });
    });

    it('increment stat', (done) => {
        StatisticsModel.set('plays', 'id-song-increment', 'increment', () => {
            StatisticsModel.set('plays', 'id-song-increment', 'increment', () => {
                StatisticsModel.get('plays', 'id-song-increment', (stat) => {
                    expect(stat.value).to.be.equal('2');
                    done();
                });
            });
        });
    });

    it('decrement stat', (done) => {
        StatisticsModel.set('plays', 'id-song-decrement', 'decrement', () => {
            StatisticsModel.get('plays', 'id-song-decrement', (stat) => {
                expect(stat.value).to.be.equal('-1');
                done();
            });
        });
    });

    it('re-check stat', (done) => {
        StatisticsModel.get('plays', 'id-song', (stat) => {
            expect(stat.value).to.be.equal('something');
            done();
        });
    });
});
