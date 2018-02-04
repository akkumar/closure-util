const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const temp = require('temp');
const glob = require('glob');

const log = require('npmlog');

const util = require('./util');


/**
 * Compile scripts.
 * @param {Object} options An object with optional `compile`, `cwd`, and `jvm`
 *     properties.
 * @param {function(Error, string)} callback Callback called with any
 *     compilation error or the result.
 */
exports = module.exports = function(options, callback) {
  options = options || {};
  if (!options.jvm) {
    options.jvm = ['-server', '-XX:+TieredCompilation'];
  }
  const compilerDir = util.getCompilerPath();
  // since version 20160713, the version number is included in the filename (closure-compiler-v20160713.jar)
  const compilerJars = glob.sync(path.join(compilerDir, '*compiler*.jar'));
  if (compilerJars.length !== 1) {
    callback(new Error('No or more than one compiler found.'));
    return;
  }
  const args = options.jvm.concat('-jar', compilerJars[0]);

  let flagFile;

  // add all compile options
  if (options.compile) {
    const flags = [];
    Object.keys(options.compile).forEach(function(key) {
      const value = options.compile[key];
      if (typeof value === 'boolean') {
        if (value) {
          flags.push('--' + key);
        }
      } else {
        const values = Array.isArray(value) ? value : [value];
        for (let i = 0, ii = values.length; i < ii; ++i) {
          flags.push('--' + key, '"' + values[i].replace(/"/g, '\\"') + '"');
        }
      }
    });
    flagFile = temp.path({prefix: 'compile-flags-', suffix: '.txt'});
    fs.writeFileSync(flagFile, flags.join(' '));
    args.push('--flagfile=' + flagFile);
  }

  log.silly('compile', 'java ' + args.join(' '));
  const child = cp.spawn('java', args, {cwd: options.cwd || process.cwd()});

  const out = [];
  child.stdout.on('data', function(chunk) {
    out.push(chunk.toString());
  });

  child.stderr.on('data', function(chunk) {
    log.error('compile', chunk.toString());
  });

  child.on('close', function(code) {
    let err = null;
    if (code !== 0) {
      err = new Error('Process exited with non-zero status, ' +
          'see log for more detail: ' + code);
    }
    if (flagFile) {
      fs.unlinkSync(flagFile);
    }
    callback(err, out.join(''));
  });
};
