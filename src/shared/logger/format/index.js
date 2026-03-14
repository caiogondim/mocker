/** @typedef {import('../../types.js').Json} Json */

import { styleText } from 'node:util'

/** @param {unknown} str @returns {string} */
function bold(str) {
  return styleText('bold', String(str))
}

/** @param {unknown} str @returns {string} */
function red(str) {
  return styleText('red', String(str))
}

/** @param {unknown} str @returns {string} */
function blue(str) {
  return styleText('blue', String(str))
}

/** @param {unknown} str @returns {string} */
function yellow(str) {
  return styleText('yellow', String(str))
}

/** @param {unknown} str @returns {string} */
function green(str) {
  return styleText('green', String(str))
}

/** @param {unknown} str @returns {string} */
function dim(str) {
  return styleText('dim', String(str))
}

/**
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

// Matches ANSI terminal escape codes (e.g. \u001b[32m for green text)
const ANSI_ESCAPE_CODE_REGEX = /\u001b\[[0-9]+m/g // eslint-disable-line no-control-regex

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
      const datumWithoutFormatingCode = datum.replace(
        ANSI_ESCAPE_CODE_REGEX,
        '',
      )
      maxWidths[i] = Math.max(
        maxWidths[i] || 0,
        datumWithoutFormatingCode.length,
      )
    }
  }

  for (const dataLine of data) {
    const lineEntries = []
    for (const [i, datum] of dataLine.entries()) {
      const datumWithoutFormatingCode = datum.replace(
        ANSI_ESCAPE_CODE_REGEX,
        '',
      )
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
   * @param {unknown} x
   * @returns {Json}
   */
  function mapToJsonStringifiableType(x) {
    // From `Set` to `Array` since `JSON.stringify` outputs an empty object for
    // a `Set`.
    if (x && x?.constructor === Set) {
      return Array.from(x)
    }
    return /** @type {Json} */ (x)
  }

  return addSpaceBetweenArrayElements(
    JSON.stringify(mapToJsonStringifiableType(x)),
  )
}

export { bold, red, blue, yellow, green, stripMargin, table, dim, stringify }
