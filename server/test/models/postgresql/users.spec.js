const expect = require('chai').expect;
const { User, sequelize } = require('../../../app/sql-models');

describe('User', () => {
    it('creation', (done) => {
        User.create({
            username: 'test',
            password: 'strong'
        }).then(() => {
            done();
        }).catch(err => {
            console.error(err);
        });
    });

    it('fetch', (done) => {
        User.findAll().then((users) => {
            expect(users).to.be.an('array').that.is.not.empty;
            done();
        });
    });
})