const expect = require('chai').expect;
const { User, sequelize } = require('../../../app/sql-models');
const UserModel = require('../../../app/model/user');

describe('User', () => {
    it('creation', (done) => {
        User.create({
            username: 'test',
            password: 'strong'
        }).then(() => {
            done();
        })
    });

    it('fetch', (done) => {
        User.findAll().then((users) => {
            expect(users).to.be.an('array').that.is.not.empty;
            expect(users.length).to.be.equals(2);
            expect(users[0].banned).to.be.false;
        }).then(() => {
            done();
        });
    });

    it('set-settings', (done)=> {
        User.findOne({where: { username: 'test'}}).then((user) => {
            UserModel.setSettings(user.id, {'setting': 'a'})
            .then(() => {
                done();
            });
        });
    });

    it('set-multiple-settings', (done)=> {
        User.findOne({where: { username: 'test'}}).then((user) => {
            UserModel.setSettings(user.id, {'setting': 'b', 'other-setting': '1'})
            .then(() => {
                done();
            });
        });
    });

    it('set-multiple-settings', (done)=> {
        User.findOne({where: { username: 'test'}}).then((user) => {
            UserModel.getSettings(user.id)
            .then((settings) => {
                done();
            });
        });
    });
})