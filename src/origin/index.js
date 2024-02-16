/** @typedef {import('../shared/http/types').Headers} Headers */

const { createRequest } = require('../shared/http')

class Origin {
  /**
   * @param {Object} options
   * @param {string} options.host
   * @param {number} [options.retries]
   * @param {Headers} [options.overwriteRequestHeaders]
   */
  constructor({ host, retries = 0, overwriteRequestHeaders = {} }) {
    /**
     * @private
     *
     * @readonly
     */
    this._host = host

    /**
     * @private
     *
     * @readonly
     */
    this._retries = retries

    /**
     * @private
     *
     * @readonly
     */
    this._overwriteRequestHeaders = overwriteRequestHeaders
  }

  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {Object<string, any>} [options.headers]
   * @param {string | undefined} [options.method]
   * @returns {ReturnType<createRequest>}
   */
  async request({ url, headers = {}, method = 'GET' }) {
    const {
      _retries: retries,
      _overwriteRequestHeaders: overwriteRequestHeaders,
    } = this
    const absoluteUrl = this._getAbsolutetUrl(url)

    // Overwriting request headers before creating the request
    for (const [key, value] of Object.entries(overwriteRequestHeaders)) {
      if (value === null || value === undefined) {
        delete headers[key]
      } else {
        headers[key] = value
      }
    }

    const [request, responsePromise] = await createRequest({
      url: absoluteUrl,
      headers,
      method,
      retries,
    })

    // Node.js adds, by default, some headers on every request
    // (e.g., `host`). Here we are removing any header that was not
    // explicitly passed as argument.
    for (const header of Object.keys(request.getHeaders())) {
      if (!Reflect.has(headers, header)) {
        request.removeHeader(header)
      }
    }

    return [request, responsePromise]
  }

  /**
   * @private
   * @param {string} url
   * @returns {string}
   */
  _getAbsolutetUrl(url) {
    const { _host: host } = this

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }

    return `${host}${url}`
  }
}

module.exports = { Origin }
