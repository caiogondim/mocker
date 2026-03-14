/** @typedef {import('../types.js').HttpStatusCode} HttpStatusCode */
/** @template T @template {Error} [E=Error] @typedef {import('../types.js').Result<T, E>} Result */

/**
 * Pre-validated HTTP status code constants.
 * @type {Readonly<Record<string, HttpStatusCode>>}
 */
const HTTP_STATUS_CODE = /** @type {const} */ ({
  OK: /** @type {HttpStatusCode} */ (200),
  CREATED: /** @type {HttpStatusCode} */ (201),
  NO_CONTENT: /** @type {HttpStatusCode} */ (204),
  NOT_MODIFIED: /** @type {HttpStatusCode} */ (304),
  BAD_REQUEST: /** @type {HttpStatusCode} */ (400),
  UNAUTHORIZED: /** @type {HttpStatusCode} */ (401),
  FORBIDDEN: /** @type {HttpStatusCode} */ (403),
  NOT_FOUND: /** @type {HttpStatusCode} */ (404),
  METHOD_NOT_ALLOWED: /** @type {HttpStatusCode} */ (405),
  INTERNAL_SERVER_ERROR: /** @type {HttpStatusCode} */ (500),
  BAD_GATEWAY: /** @type {HttpStatusCode} */ (502),
  SERVICE_UNAVAILABLE: /** @type {HttpStatusCode} */ (503),
})

/**
 * @param {number} input
 * @returns {Result<HttpStatusCode>}
 */
function parse(input) {
  if (!Number.isInteger(input) || input < 100 || input > 599) {
    return {
      ok: false,
      error: new TypeError(`Expected an HTTP status code (100–599), got: ${input}`),
    }
  }

  return { ok: true, value: /** @type {HttpStatusCode} */ (input) }
}

export { parse, HTTP_STATUS_CODE }
