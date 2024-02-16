/**
 * @callback ConsoleMethod
 * @param {...any} [args]
 * @returns {void}
 */
/** @typedef {{ log: ConsoleMethod; error: ConsoleMethod; warn: ConsoleMethod }} Console */
/** @typedef {'silent' | 'error' | 'warn' | 'verbose'} LoggerLevels */

const { red, blue, yellow, green } = require('./format')
const { isPrettyError } = require('./pretty-error')

/**
 * Simple wrapper around `console` to consolidate the decision about when a
 * given `console` method should print or not.
 */
class Logger {
  /**
   * @type {LoggerLevels[]}
   *
   * @readonly
   */
  static validLevels = ['silent', 'error', 'warn', 'verbose']

  /** @type {LoggerLevels} */
  static level = 'silent'

  /**
   * @param {Object} options
   * @param {Console} [options.console]
   * @param {boolean} [options.forceLog]
   */
  constructor({ console = global.console, forceLog = false } = {}) {
    /**
     * @private
     * @readonly
     */
    this._console = console

    this.forceLog = forceLog
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  log(...args) {
    if (!this._shouldLog('verbose')) {
      return false
    }

    this._console.log(...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  warn(...args) {
    if (!this._shouldLog('warn')) {
      return false
    }

    this._console.warn(yellow('warn'), ...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  error(...args) {
    if (!this._shouldLog('error')) {
      return false
    }

    // In case it's a pretty error object, print its message property since it's
    // already formatted.
    if (isPrettyError(args[0])) {
      this._console.error(args[0].message)
      return false
    }

    this._console.error(red('erro'), ...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  info(...args) {
    if (!this._shouldLog('warn')) {
      return false
    }

    this._console.log(blue('info'), ...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  success(...args) {
    if (!this._shouldLog('warn')) {
      return false
    }

    this._console.log(green('succ'), ...args)

    return true
  }

  /**
   * @private
   * @param {LoggerLevels} method
   * @returns {Boolean}
   */
  _shouldLog(method) {
    if (this.forceLog) return true

    return (
      Logger.validLevels.indexOf(method) <=
      Logger.validLevels.indexOf(Logger.level)
    )
  }
}

module.exports = Logger
