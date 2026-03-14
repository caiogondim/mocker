/** @typedef {import('../types.js').AbsoluteHttpUrl} AbsoluteHttpUrl */

import { isHttpUrl } from '../http-url/index.js'

/**
 * @param {string} url
 * @returns {import("../types.js").Result<AbsoluteHttpUrl>}
 */
function parse(url) {
  if (!isHttpUrl(url)) {
    return {
      ok: false,
      error: new TypeError(`Expected an absolute HTTP or HTTPS URL, got: "${url}"`),
    }
  }

  return { ok: true, value: /** @type {AbsoluteHttpUrl} */ (url) }
}

export { parse }
