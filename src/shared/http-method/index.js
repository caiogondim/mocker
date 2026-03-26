/** @typedef {import('../types.js').HttpMethod} HttpMethod */
/** @import { Result } from '../types.js' */

const HTTP_METHOD = /** @satisfies {Record<string, HttpMethod>} */ (
  /** @type {const} */ ({
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',
    PATCH: 'PATCH',
    HEAD: 'HEAD',
    OPTIONS: 'OPTIONS',
  })
)

/** @type {ReadonlySet<string>} */
const VALID_METHODS = new Set(Object.values(HTTP_METHOD))

/**
 * @param {string | undefined} input
 * @returns {Result<HttpMethod>}
 */
function parse(input) {
  if (!input || !VALID_METHODS.has(input)) {
    return {
      ok: false,
      error: new TypeError(`Expected a valid HTTP method, got: "${input}"`),
    }
  }

  return { ok: true, value: /** @type {HttpMethod} */ (input) }
}

export { HTTP_METHOD, parse }
