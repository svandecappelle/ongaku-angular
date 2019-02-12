const expect = require('chai').expect;
const { User, sequelize } = require('../../../app/models');

describe('User', () => {
    it('creation', (done) => {
        User.create({
            username: 'test',
            password: 'strong'
        }).then(() => {
            done();
        });
    });

    it('fetch', (done) => {
        User.findAll().then((users) => {
            expect(users).to.be.an('array').that.is.not.empty;
            done();
        });
    });
})