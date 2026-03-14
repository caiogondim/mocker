/** @typedef {(...args: unknown[]) => void} ConsoleMethod */
/** @typedef {{ log: ConsoleMethod; error: ConsoleMethod; warn: ConsoleMethod }} Console */
/** @typedef {'silent' | 'error' | 'warn' | 'verbose'} LoggerLevels */

import { red, blue, yellow, green } from './format/index.js'
import { isPrettyError } from './pretty-error/index.js'

/**
 * @type {LoggerLevels[]}
 *
 * @readonly
 */
export const validLevels = ['silent', 'error', 'warn', 'verbose']

/** @type {LoggerLevels} */
let level = 'silent'

/** @returns {LoggerLevels} */
export function getLevel() {
  return level
}

/** @param {LoggerLevels} newLevel */
export function setLevel(newLevel) {
  level = newLevel
}

/**
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

    return validLevels.indexOf(method) <= validLevels.indexOf(getLevel())
  }

  /**
   * @param {unknown[]} args
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
   * @param {unknown[]} args
   * @returns {Boolean}
   */
  function warn(...args) {
    if (!_shouldLog('warn')) {
      return false
    }

    _console.warn(yellow('warn'), ...args)

    return true
  }

  /**
   * @param {unknown[]} args
   * @returns {Boolean}
   */
  function error(...args) {
    if (!_shouldLog('error')) {
      return false
    }

    // In case it's a pretty error object, print its message property since it's
    // already formatted.
    if (isPrettyError(args[0])) {
      _console.error(/** @type {{ message: unknown }} */ (args[0]).message)
      return false
    }

    _console.error(red('erro'), ...args)

    return true
  }

  /**
   * @param {unknown[]} args
   * @returns {Boolean}
   */
  function info(...args) {
    if (!_shouldLog('warn')) {
      return false
    }

    _console.log(blue('info'), ...args)

    return true
  }

  /**
   * @param {unknown[]} args
   * @returns {Boolean}
   */
  function success(...args) {
    if (!_shouldLog('warn')) {
      return false
    }

    _console.log(green('succ'), ...args)

    return true
  }

  return { log, warn, error, info, success }
}

export default createLogger
