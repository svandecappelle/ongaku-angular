const expect = require('chai').expect;
const { User } = require('../../../app/models');

describe('Can create user', () => {
    it('create user should works', () => {
        User.create({
            username: 'test',
            password: 'strong'
        });
    });
})