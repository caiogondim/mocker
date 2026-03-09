/** @typedef {import('../shared/http/types').Headers} Headers */

const { createRequest } = require('../shared/http')

/**
 * @param {Object} options
 * @param {string} options.host
 * @param {number} [options.retries]
 * @param {Headers} [options.overwriteRequestHeaders]
 */
function createOrigin({ host, retries = 0, overwriteRequestHeaders = {} }) {
  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {Object<string, any>} [options.headers]
   * @param {string | undefined} [options.method]
   * @returns {ReturnType<createRequest>}
   */
  async function request({ url, headers = {}, method = 'GET' }) {
    const headersCopy = structuredClone(headers)
    const absoluteUrl = getAbsoluteUrl(url)

    for (const [key, value] of Object.entries(overwriteRequestHeaders)) {
      if (value === null || value === undefined) {
        delete headersCopy[key]
      } else {
        headersCopy[key] = value
      }
    }

    const [req, responsePromise] = await createRequest({
      url: absoluteUrl,
      headers: headersCopy,
      method,
      retries,
    })

    return [req, responsePromise]
  }

  /**
   * @param {string} url
   * @returns {string}
   */
  function getAbsoluteUrl(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return `${host}${url}`
  }

  return { request }
}

module.exports = { createOrigin }
