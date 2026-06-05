type ConsoleMethod = (...args: unknown[]) => void
export type Console = {
  log: ConsoleMethod
  error: ConsoleMethod
  warn: ConsoleMethod
}
type LoggerLevels = 'silent' | 'error' | 'warn' | 'verbose'

import { blue, green, red, yellow } from './format/index.js'
import { isPrettyError } from './pretty-error/index.js'

export const validLevels: LoggerLevels[] = [
  'silent',
  'error',
  'warn',
  'verbose',
]

let level: LoggerLevels = 'silent'

export function getLevel(): LoggerLevels {
  return level
}

export function setLevel(newLevel: LoggerLevels) {
  level = newLevel
}

function createLogger({
  console: _console = global.console,
  forceLog = false,
}: {
  console?: Console
  forceLog?: boolean
} = {}) {
  function _shouldLog(method: LoggerLevels): boolean {
    if (forceLog) return true

    return validLevels.indexOf(method) <= validLevels.indexOf(getLevel())
  }

  function log(...args: unknown[]): boolean {
    if (!_shouldLog('verbose')) {
      return false
    }

    _console.log(...args)

    return true
  }

  function warn(...args: unknown[]): boolean {
    if (!_shouldLog('warn')) {
      return false
    }

    _console.warn(yellow('warn'), ...args)

    return true
  }

  function error(...args: unknown[]): boolean {
    if (!_shouldLog('error')) {
      return false
    }

    // In case it's a pretty error object, print its message property since it's
    // already formatted.
    if (isPrettyError(args[0])) {
      _console.error((args[0] as { message: unknown }).message)
      return true
    }

    _console.error(red('erro'), ...args)

    return true
  }

  function info(...args: unknown[]): boolean {
    if (!_shouldLog('warn')) {
      return false
    }

    _console.log(blue('info'), ...args)

    return true
  }

  function success(...args: unknown[]): boolean {
    if (!_shouldLog('warn')) {
      return false
    }

    _console.log(green('succ'), ...args)

    return true
  }

  return { log, warn, error, info, success }
}

export default createLogger
