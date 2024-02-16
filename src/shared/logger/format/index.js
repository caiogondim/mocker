/** @typedef {import('../../types').Json} Json */

// @see https://blog.bitsrc.io/coloring-your-terminal-using-nodejs-eb647d4af2a2

const supportsColor = require('../supports-color')()

const reset = '\x1b[0m'

/**
 * @param {any} str
 * @returns {string}
 */
function bold(str) {
  if (!supportsColor) return str
  return `\x1b[1m${str}\x1b[22m${reset}`
}

/**
 * @param {any} str
 * @returns {string}
 */
function red(str) {
  if (!supportsColor) return str
  return `\x1b[31m${str}\x1b[89m${reset}`
}

/**
 * @param {any} str
 * @returns {string}
 */
function blue(str) {
  if (!supportsColor) return str
  return `\x1b[34m${str}\x1b[89m${reset}`
}

/**
 * @param {any} str
 * @returns {string}
 */
function yellow(str) {
  if (!supportsColor) return str
  return `\x1b[33m${str}\x1b[89m${reset}`
}

/**
 * @param {any} str
 * @returns {string}
 */
function green(str) {
  if (!supportsColor) return str
  return `\x1b[32m${str}\x1b[89m${reset}`
}

/**
 * @param {any} str
 * @returns {string}
 */
function dim(str) {
  if (!supportsColor) return str
  return `\x1b[2m${str}\x1b[22m${reset}`
}

/**
 * Based on stripMargin from Scala
 * https://docs.scala-lang.org/overviews/scala-book/two-notes-about-strings.html#multiline-strings.
 *
 *
 * @param {string} str
 * @param {string} [marginChar]
 * @returns {string}
 */
function stripMargin(str, marginChar = '|') {
  const regexp = new RegExp(`[\\s]+\\${marginChar}`, `g`)
  const output = []
  for (const line of str.split('\n')) {
    output.push(line.replace(regexp, ''))
  }
  return output.join('\n')
}

/**
 * @param {string[][]} data
 * @returns {string}
 */
function table(...data) {
  /** @type {number[]} */
  const maxWidths = []
  const lines = []

  for (const dataLine of data) {
    for (const [i, datum] of dataLine.entries()) {
      // eslint-disable-next-line no-control-regex
      const datumWithoutFormatingCode = datum.replace(/\u001b\[[0-9]+m/g, '')
      maxWidths[i] = Math.max(
        maxWidths[i] || 0,
        datumWithoutFormatingCode.length
      )
    }
  }

  for (const dataLine of data) {
    const lineEntries = []
    for (const [i, datum] of dataLine.entries()) {
      // eslint-disable-next-line no-control-regex
      const datumWithoutFormatingCode = datum.replace(/\u001b\[[0-9]+m/g, '')
      const endPadding = datumWithoutFormatingCode
        .padEnd(maxWidths[i], ' ')
        .replace(datumWithoutFormatingCode, '')
      lineEntries.push(`${datum}${endPadding}`)
    }
    lines.push(lineEntries.join('  '))
  }

  return lines.join('\n')
}

/**
 * @param {unknown} x
 * @returns {string}
 */
function stringify(x) {
  if (x === undefined) {
    return ''
  }

  /** @param {string} x */
  function addSpaceBetweenArrayElements(x) {
    return x.replaceAll(`","`, `", "`)
  }

  /**
   * @param {any} x
   * @returns {Json}
   */
  function mapToJsonStringifiableType(x) {
    // From `Set` to `Array` since `JSON.stringify` outputs an empty object for
    // a `Set`.
    if (x && x?.constructor === Set) {
      return Array.from(x)
    }
    return x
  }

  return addSpaceBetweenArrayElements(
    JSON.stringify(mapToJsonStringifiableType(x))
  )
}

module.exports = {
  bold,
  red,
  blue,
  yellow,
  green,
  stripMargin,
  table,
  dim,
  stringify,
}
