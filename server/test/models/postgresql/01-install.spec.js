const expect = require('chai').expect;
const fs = require('fs');
const nconf = require('nconf');
const path = require('path');
const moment = require('moment');
const nconfYaml = require('nconf-yaml');
const async = require('async');
nconf.file({
    file: path.resolve(__dirname, '../../../config/application.yml'),
    format: nconfYaml
});

const { User, Config, sequelize } = require('../../../app/sql-models');
const installation = require('../../../db/postgres/install');

const uninstall = () => {
    console.log('uninstall schema');    
    var sqlFileContent = fs.readFileSync(path.resolve(__dirname, '../../../db/postgres', 'uninstall.sql'), 'utf8');
    const queries = sqlFileContent.split(';');
    const prom = queries.map((query) => {
        return (next) => {
            return sequelize.query(query, {
                raw: true
            }).then(() => next(null, true))
              .catch((error) => next());
        };
    });
    return new Promise((resolve) => {
        async.series(prom, (err, results) => {
            resolve();
        });
    });
};

before((done) => {
    uninstall().then(() => {
        done();
    });
});

after((done) => {
    sequelize.close().then(() => {
        done();
    });
});

let installationDate;

describe('Installation', () => {
    it('sql scripts should works', (done) => {
        installationDate = moment();
        installation.install().then((success) => {
            expect(success).to.be.true;
        }).then(() => done(), done)
        .catch((err) => {
            done(err)
        });
    }).timeout(120 * 1000);

    it('check initialized', (done) => {
        Config.findOne({ where: { 'property': 'installed_at' }, raw: true }).then((conf) => {
            expect(conf.property).to.equal('installed_at');
            expect(moment(conf.value).startOf('minute').format()).to.equal(installationDate.startOf('minute').format());
            done();
        })
    });

    it('admin should be created', (done) => {
        User.findAll().then((users) => {
            expect(users).to.be.an('array').that.is.not.empty;
            done();
        });
    })
});