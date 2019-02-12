const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const { User, sequelize } = require('../../../app/models');
const installation = require('../../../db/postgres/install');

const uninstall = () => {
    return new Promise((resolve, reject) => {
        var sqlFileContent = fs.readFileSync(path.resolve(__dirname, '../../../db/postgres', 'uninstall.sql'), 'utf8');
        sequelize.query(sqlFileContent, {
            raw: true
        }).then(() => {
            console.log("** query success ** ");
            console.log(`schema successfully uninstalled`);
            resolve();
        }).catch ((error) => {
            // TODO check on error to retry errors and have an incremental install
            reject({
                msg: 'Error uninstalling application',
                details: error
            });
        });
    });
};

before((done) => {
    sequelize.query("select * from installations", {
        raw: true
    }).then(() => {
        console.log("** query success ** ");
        uninstall().then(() => {
            done();
        });
    }).catch(() => {
        // not installed
        done();
    });
});

after((done) => {
    sequelize.close().then(() => {
        done();
    });
});

describe('Can install', () => {
    it('installation sql scripts should works', (done) => {
        installation.install().then((success) => {
            console.log("Installed");
            expect(success).to.be.true;
        }).then(() => done(), done);
    }).timeout(120 * 1000);
});