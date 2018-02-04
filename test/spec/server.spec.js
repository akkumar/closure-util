const path = require('path');

const request = require('supertest');

const Manager = require('../../lib/manager').Manager;
const Server = require('../../lib/server').Server;

const helper = require('../helper');

const assert = helper.assert;
const fixtures = path.join(__dirname, '..', 'fixtures');

describe('server', function() {

  describe('Server', function() {

    describe('constructor', function() {
      it('creates a Server instance', function() {
        const server = new Server({
          manager: new Manager({
            closure: false,
            cwd: fixtures
          })
        });

        assert.instanceOf(server, Server);
      });
    });

    describe('serves static files', function() {
      it('returns the file', function(done) {
        const server = new Server({
          manager: new Manager({
            closure: false,
            cwd: fixtures
          }),
          root: fixtures
        });
        request(server)
          .get('/basic/one.js')
          .expect(200, done);
      });
    });
  });
});
