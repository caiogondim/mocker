/** @typedef {import('../types.js').HttpUrl} HttpUrl */

import { tryCatch } from '../try-catch/index.js'

/**
 * @param {string} input
 * @returns {boolean}
 */
function isHttpUrl(input) {
  const result = tryCatch(() => new URL(input))
  return (
    result.ok &&
    (result.value.protocol === 'http:' || result.value.protocol === 'https:')
  )
}

/**
 * @param {string} input
 * @returns {import("../types.js").Result<HttpUrl>}
 */
function parse(input) {
  if (!isHttpUrl(input)) {
    return {
      ok: false,
      error: new TypeError(`Expected an HTTP or HTTPS URL, got: "${input}"`),
    }
  }

  return { ok: true, value: /** @type {HttpUrl} */ (input) }
}

export { parse, isHttpUrl }
