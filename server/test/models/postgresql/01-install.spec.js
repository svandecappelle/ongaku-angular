const expect = require('chai').expect;
const { User } = require('../../../app/models');
const installation = require('../../../db/postgres/install');

describe('Can install', () => {
    it('installation sql scripts should works', (done) => {
        installation.install().then((success) => {
            console.log("Installed");
            expect(success).to.be.true;
        }).then(() => done(), done);
    }).timeout(120 * 1000);
})