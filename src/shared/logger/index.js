/**
 * @callback ConsoleMethod
 * @param {{ (...data: any[]): void; (message?: any, ...optionalParams: any[]): void; }} [args]
 * @returns {void}
 */
/** @typedef {{ log: ConsoleMethod; error: ConsoleMethod; warn: ConsoleMethod }} Console */
/** @typedef {'silent' | 'error' | 'warn' | 'verbose'} LoggerLevels */

const { red, blue, yellow, green } = require('./format')
const { isPrettyError } = require('./pretty-error')

/**
 * @type {LoggerLevels[]}
 *
 * @readonly
 */
const validLevels = ['silent', 'error', 'warn', 'verbose']

/** @type {LoggerLevels} */
let level = 'silent' // eslint-disable-line jest/require-hook

/**
 * Simple wrapper around `console` to consolidate the decision about when a
 * given `console` method should print or not.
 *
 * @param {Object} [options]
 * @param {Console} [options.console]
 * @param {boolean} [options.forceLog]
 */
function createLogger({
  console: _console = global.console,
  forceLog = false,
} = {}) {
  /**
   * @param {LoggerLevels} method
   * @returns {Boolean}
   */
  function _shouldLog(method) {
    if (forceLog) return true

    return (
      validLevels.indexOf(method) <= validLevels.indexOf(createLogger.level)
    )
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  function log(...args) {
    if (!_shouldLog('verbose')) {
      return false
    }

    _console.log(...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  function warn(...args) {
    if (!_shouldLog('warn')) {
      return false
    }

    // @ts-expect-error
    _console.warn(yellow('warn'), ...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  function error(...args) {
    if (!_shouldLog('error')) {
      return false
    }

    // In case it's a pretty error object, print its message property since it's
    // already formatted.
    if (isPrettyError(args[0])) {
      _console.error(args[0].message)
      return false
    }

    // @ts-expect-error
    _console.error(red('erro'), ...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  function info(...args) {
    if (!_shouldLog('warn')) {
      return false
    }

    // @ts-expect-error
    _console.log(blue('info'), ...args)

    return true
  }

  /**
   * @param {any[]} args
   * @returns {Boolean}
   */
  function success(...args) {
    if (!_shouldLog('warn')) {
      return false
    }

    // @ts-expect-error
    _console.log(green('succ'), ...args)

    return true
  }

  return { log, warn, error, info, success }
}

createLogger.validLevels = validLevels

// eslint-disable-next-line jest/require-hook
Object.defineProperty(createLogger, 'level', {
  get() {
    return level
  },
  set(/** @type {LoggerLevels} */ newLevel) {
    level = newLevel
  },
  enumerable: true,
  configurable: true,
})

module.exports = createLogger
