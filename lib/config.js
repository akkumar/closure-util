/**
 * Previously, the config-chain package was used here.  This failed on Node
 * 0.11 - see https://github.com/dominictarr/config-chain/issues/18.
 *
 * The find and getEnv functions below are adapted from config-chain.  This
 * module doesn't provide equivalent functionality, but it does export a `get`
 * function that works similarly to config-chain's `get` (without the where
 * argument).
 */

const fs = require('fs');
const path = require('path');

/**
 * Return the first occurrence of a file with the provided basename in any
 * of the parent paths.
 * @param {string} file Full pathname.
 * @return {string} Path to an existing file (or undefined).
 */
function find(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  try {
    fs.statSync(file);
  } catch (err) {
    // not found or some other error
    const parent = path.dirname(dir);
    if (parent !== dir) {
      file = find(path.join(parent, base));
    } else {
      // at the root
      file = undefined;
    }
  }
  return file;
}

/**
 * Get all values from the current env where keys start with the given prefix.
 * @param {string} prefix Prefix.
 * @return {Object} A lookup of env values by unprefixed key.
 */
function getEnv(prefix) {
  const obj = {};
  const length = prefix.length;
  for (const key in process.env) {
    if (key.indexOf(prefix) === 0) {
      obj[key.substring(length)] = process.env[key];
    }
  }
  return obj;
}

// assign defaults
const config = require(path.join(__dirname, '..', 'default-config.json'));

const configName = 'closure-util.json';
let key;

// check for settings in install path
const installPath = find(path.join(__dirname, configName));
if (installPath) {
  const installConfig = require(installPath);
  for (key in installConfig) {
    config[key] = installConfig[key];
  }
}

// check for settings in cwd and parent paths
const cwdPath = find(path.join(process.cwd(), configName));
if (cwdPath) {
  const cwdConfig = require(cwdPath);
  for (key in cwdConfig) {
    config[key] = cwdConfig[key];
  }
}

// check for evn vars
const env = getEnv('closure_');
for (key in env) {
  config[key] = env[key];
}


/**
 * Get a config property.
 * @param {string} key The property name.
 * @return {*} The property value.
 */
exports.get = function(key) {
  return config[key];
};
