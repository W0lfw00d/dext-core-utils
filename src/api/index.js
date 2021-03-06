const fs = require('fs');
const spawn = require('cross-spawn');
const rimraf = require('rimraf');
const npmName = require('npm-name');
const {
  ERR_MODULE_DOWNLOAD_ERROR,
  ERR_MODULE_ENABLED,
  ERR_MODULE_NOT_FOUND,
  ERR_MODULE_DISABLED,
  ERR_MODULE_REMOVE_FAILED,
  ERR_THEME_ALREADY_ACTIVE,
} = require('../errors');
const Conf = require('../utils/conf');
const plugins = require('./plugins');
const { downloadPackage } = require('../utils/download');
const { getPluginPath } = require('../utils/paths');

const config = new Conf();

/**
 * Checks if the plugin/package exists on npm
 *
 * @param {String} plugin - The name of the plugin/package
 * @return {Promise} - Resolves true if the plugin is found on npm
 */
const checkOnNpm = plugin => new Promise((resolve) => {
  npmName(plugin).then(notFound => resolve(!notFound));
});

/**
 * Installs and enabled a plugin/package and saves it to the given directory
 *
 * @param {String} plugin - The name of the plugin/package
 * @param {String} outputDir - The directory to install the plugin/package
 * @return {Promise}
 */
const install = (plugin, outputDir) => new Promise((resolve, reject) => {
  if (plugins.isEnabled(plugin)) {
    reject(ERR_MODULE_ENABLED);
    return;
  }

  checkOnNpm(plugin).then((found) => {
    // if the plugin is not found
    if (!found) {
      reject(ERR_MODULE_NOT_FOUND);
      return;
    }
    // download, install, and update configs
    downloadPackage(plugin, outputDir).then((output) => {
      const installProcess = spawn('npm', ['install', '--prefix', output]);
      installProcess.on('close', (code) => {
        if (code) {
          reject(ERR_MODULE_DOWNLOAD_ERROR);
          return;
        }
        // enable the plugin
        plugins.enable(plugin);
        resolve();
      });
    });
  });
});

/**
 * Uninstalls a plugin/package from the given source directory
 *
 * @param {String} plugin - The name of the plugin/package
 * @param {String} srcDir - The source directory of the plugin/package
 * @return {Promise}
 */
const uninstall = (plugin, srcDir) => new Promise((resolve, reject) => {
  if (!plugins.isEnabled(plugin)) {
    reject(ERR_MODULE_DISABLED);
    return;
  }

  // removes the directory
  const pluginDir = srcDir;
  rimraf(pluginDir, (err) => {
    // if there's an error trying to remove the plugin
    if (err) {
      reject(ERR_MODULE_REMOVE_FAILED);
      return;
    }
    // disable the plugin
    plugins.disable(plugin);
    resolve();
  });
});

/**
 * Creates a symlink for the current directory to the Dext plugin directory
 *
 * @param {String} plugin - The name of the plugin/package
 * @param {String} src - The source directory to link
 * @return {Promise} - An object shape with { srcPath, destPath }
 */
const createSymLink = (plugin, src) => new Promise((resolve) => {
  const dest = getPluginPath(plugin);
  fs.link(src, dest, () => {
    plugins.enable(plugin);
    resolve({
      srcPath: src,
      destPath: dest,
    });
  });
});

/**
 * Removes symlink for the given plugin
 *
 * @param {String} src - The source directory to link
 * @param {String} plugin - The name of the plugin/package
 * @return {Promise} - An object shape with { destPath }
 */
const removeSymLink = plugin => new Promise((resolve) => {
  const dest = getPluginPath(plugin);
  fs.unlink(dest, () => {
    plugins.disable(plugin);
    resolve({
      destPath: dest,
    });
  });
});

/**
 * Switches your current theme
 *
 * @param {String} theme - The name of the theme
 * @return {Promise}
 */
const setTheme = theme => new Promise((resolve, reject) => {
  const currentTheme = config.get('theme');

  // if theme is currently active
  if (currentTheme === theme) {
    reject(ERR_THEME_ALREADY_ACTIVE);
  }

  // if theme plugin is disabled
  if (!plugins.isEnabled(theme)) {
    reject(ERR_MODULE_DISABLED);
  }

  config.set('theme', theme);

  resolve();
});

/**
 * Retrieve the current theme
 *
 * @return {String} - The current name of the theme
 */
const getTheme = () => new Promise((resolve) => {
  const currentTheme = config.get('theme') || '';
  resolve(currentTheme);
});

/**
 * Retrieve the current config
 *
 * @return {Object} - The current configuration
 */
const getConfig = () => new Promise((resolve) => {
  resolve(config.store);
});

module.exports = {
  checkOnNpm,
  install,
  uninstall,
  createSymLink,
  removeSymLink,
  setTheme,
  getTheme,
  getConfig,
  plugins,
};
