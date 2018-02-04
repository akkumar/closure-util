const fs = require('fs');
const path = require('path');
const temp = require('temp').track();

const build = require('../../lib/build');

const helper = require('../helper');

const assert = helper.assert;
const fixtures = path.join(__dirname, '..', 'fixtures');


describe('build', function() {
  it('creates an output file', function(done) {
    // this test runs the compiler, increase the timeout value
    this.timeout(45000);
    const outputFile = temp.path({suffix: '.js'});
    const configFile = path.join(fixtures, 'config.json');
    build(configFile, outputFile, function(err) {
      assert.isNull(err);
      fs.exists(outputFile, function(exists) {
        assert.isTrue(exists);
        done();
      });
    });
  });
});
