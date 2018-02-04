const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const util = require('util');

const async = require('async');
const handlebars = require('handlebars');
const send = require('send');
const socketIO = require('socket.io');


/**
 * Server constructor.
 * @param {Object} config Server config.
 * @constructor
 * @extends {http.Server}
 */
const Server = exports.Server = function Server(config) {
  http.Server.call(this, this._requestListener.bind(this));

  this._manager = config.manager;
  this._root = config.root || process.cwd();

  this._loader = config.loader || '/@';

  /**
   * Connect server to client.
   * @type {[type]}
   */
  this._socket = config.hasOwnProperty('socket') ? config.socket : true;

  // allow override
  if (config.getMain) {
    this.getMain = config.getMain;
  }

  /**
   * Cached handlebars templates.
   * @type {Object.<string, Template>}
   */
  this._templates = {};

  if (this._socket) {
    this.on('listening', this._bindSocket.bind(this));
  }
};
util.inherits(Server, http.Server);


/**
 * Prepare Socket I/O for client messages.
 */
Server.prototype._bindSocket = function() {
  const manager = this._manager;
  const io = socketIO.listen(this, {
    'log level': 0
  });
  io.sockets.on('connection', function(socket) {
    function onError(err) {
      socket.emit('error', {message: err.message});
    }
    function onUpdate(script) {
      socket.emit('update', script && script.path);
    }
    manager.getErrors().forEach(onError);
    manager.on('error', onError);
    manager.on('update', onUpdate);
    socket.on('disconnect', function() {
      manager.removeListener('error', onError);
      manager.removeListener('update', onUpdate);
    });
  });
};


/**
 * Compile the template and provide it to the callback.
 * @param {string} name Template name.
 * @param {function(Error, Template)} callback Callback.
 */
Server.prototype._getTemplate = function(name, callback) {
  const template = this._templates[name];
  const self = this;
  if (template) {
    process.nextTick(function() {
      callback(null, template);
    });
  } else {
    fs.readFile(path.join(__dirname, '..', 'templates', name),
      function(err, data) {
        if (err) {
          return callback(err);
        }
        const local_template = handlebars.compile(String(data));
        self._templates[name] = local_template;
        callback(null, local_template);
      });
  }
};


/**
 * Render the template to the response with the provided context.
 * @param {string} name Template name.
 * @param {Object} context Data.
 * @param {http.ServerResponse} res Response.
 */
Server.prototype._renderTemplate = function(name, context, res) {
  const types = {
    '.js': 'application/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8'
  };
  this._getTemplate(name, function(err, template) {
    if (err) {
      res.statusCode = 500;
      return res.end('Cannot find index template');
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(name)] || 'text/plain'
    });
    res.end(template(context));
  });
};


/**
 * Function added to the server's request event.
 * @param {http.IncomingMessage} req Request.
 * @param {http.ServerResponse} res Response.
 * @return {undefined} Undefined.
 */
Server.prototype._requestListener = function(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, {});
    res.end('Not allowed');
    return;
  }
  const parts = url.parse(req.url, true);
  const pathname = parts.pathname;
  const match = this._useLoader(req);
  if (match) {
    // managed script
    const filepath = this._getPath(req, match);
    if (!filepath) {
      // request for loader
      const main = this.getMain(req);
      if (main && !this._manager.getScript(main)) {
        return this._renderTemplate('error.js', {
          message: 'Main script not in manager paths: ' + main
        }, res);
      }
      const deps = this._manager.getDependencies(main);
      const paths = deps.map(function(s) {
        return match + s.path;
      });
      this._renderTemplate('load.js', {
        socket: this._socket,
        paths: JSON.stringify(paths),
        root: 'http://' + req.headers.host
      }, res);
    } else {
      const script = this._manager.getScript(filepath);
      if (!script) {
        res.writeHead(404, {});
        res.end('Script not being managed: ' + filepath);
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Content-Length': script.source.length
        });
        res.end(script.source);
      }
    }
  } else {
    const options = {
      root: this._root
    };
    // assume static
    send(req, pathname, options)
      .on('error', this._handleStaticError.bind(this, req, res))
      .pipe(res);
  }
};


/**
 * Determine if an incoming request is for the script loader.  By default,
 * paths starting with '/@' will be handled by the loader.
 * @param {http.IncomingRequest} req Request.
 * @return {boolean|string} This request should be handled by the loader.
 */
Server.prototype._useLoader = function(req) {
  let match = false;
  if (typeof this._loader === 'string') {
    match = req.url.indexOf(this._loader) === 0 ? this._loader : false;
  } else {
    const matches = req.url.match(this._loader);
    match = matches && matches[0];
  }
  return match;
};


/**
 * Get the absolute path to a script from an incoming request.
 * @param {http.IncomingRequest} req Request.
 * @param {string} loader Matched loader path.
 * @return {string|undefined} Absolute path to script (or undefined if none).
 */
Server.prototype._getPath = function(req, loader) {
  const urlPath = url.parse(req.url).pathname.substring(loader.length);
  return urlPath ? path.resolve(urlPath) : undefined;
};


/**
 * Get the path to the main script from an incoming request.  By default, the
 * main path is taken from the 'main' query string parameter.  For requests
 * with a referer, the path is assumed to be relative to the referer.  For
 * requests without a referer, the path is assumed to be relative to the server
 * root.
 * @param {http.IncomingRequest} req Request.
 * @return {string} Path to main script.
 */
Server.prototype.getMain = function(req) {
  let main;
  const query = url.parse(req.url, true).query;
  if (query.main) {
    let from = this._root;
    const referer = req.headers.referer;
    if (referer) {
      from = path.join(from, path.dirname(url.parse(referer).pathname));
    }
    main = path.resolve(from, query.main);
  }
  return main;
};


/**
 * Get entries representing all items in a directory.  Ignores items that start
 * with a dot.
 * @param {string} dir Path to directory.
 * @param {function(error, Array)} callback Callback.
 */
function getEntries(dir, callback) {
  async.waterfall([
    fs.readdir.bind(fs, dir),
    function(items, done) {
      items = items.filter(function(item) {
        return item.indexOf('.') !== 0;
      });
      const paths = items.map(function(item) {
        return path.join(dir, item);
      });
      async.map(paths, fs.stat, function(err, stats) {
        if (err) {
          return done(err);
        }
        const entries = items.map(function(item, index) {
          const isDir = stats[index].isDirectory();
          return {
            path: item + (isDir ? '/' : ''),
            name: item,
            dir: isDir
          };
        });
        done(null, entries);
      });
    }
  ], callback);
}


/**
 * Handle errors from static server.
 * @param {http.IncomingRequest} req Request.
 * @param {http.ServerResponse} res Response.
 * @param {Error} err Error.
 */
Server.prototype._handleStaticError = function(req, res, err) {
  const self = this;
  if (err.status === 404 && req.url.slice(-1) === '/') {
    // directory listing
    const pathname = url.parse(req.url).pathname;
    const dir = path.join(this._root, pathname);
    if (dir.indexOf(this._root) !== 0) {
      res.statusCode = 403;
      res.end('Outside root');
    } else {
      getEntries(dir, function(err, entries) {
        if (err) {
          res.statusCode = 500;
          return void res.end(err.message);
        }
        if (pathname !== '/') {
          entries.unshift({
            path: '..',
            name: '..',
            dir: true
          });
        }
        self._renderTemplate('index.html', {
          pathname: pathname,
          entries: entries
        }, res);
      });
    }
  } else {
    res.statusCode = err.status || 500;
    res.end(err.message);
  }
};
