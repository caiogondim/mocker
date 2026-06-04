/** @typedef {import('../types.js').AbsolutePath} AbsolutePath */
/** @import { Result } from '../types.js' */

/**
 * Parse a string into an absolute URL path (must start with `/`). Unlike
 * AbsoluteDirPath this does no filesystem check — it brands a request-target
 * path used for `--rewritePath` rules.
 *
 * @param {string} input
 * @returns {Result<AbsolutePath>}
 */
function parse(input) {
  if (!input.startsWith('/')) {
    return {
      ok: false,
      error: new TypeError(`Expected an absolute path, got: "${input}"`),
    }
  }

  return {
    ok: true,
    value: /** @type {AbsolutePath} */ (input),
  }
}

export { parse }
