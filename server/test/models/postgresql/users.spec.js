const expect = require('chai').expect;
const { User, sequelize } = require('../../../app/models');

describe('Can create user', () => {
    it('create user should works', (done) => {
        User.create({
            username: 'test',
            password: 'strong'
        }).then(() => {
            done();
        });
    });
})