/** @typedef {import('../shared/http/types.js').Headers} Headers */

import { createRequest } from '../shared/http/index.js'

/**
 * @param {Object} options
 * @param {import('../args/types.js').HttpUrl} options.host
 * @param {import('../args/types.js').NonNegativeInteger} [options.retries]
 * @param {Headers} [options.overwriteRequestHeaders]
 * @param {import('../args/types.js').HttpUrl} [options.proxyUrl]
 */
function createOrigin({
  host,
  retries = /** @type {import('../args/types.js').NonNegativeInteger} */ (0),
  overwriteRequestHeaders = {},
  proxyUrl,
}) {
  const parsedProxyUrl = proxyUrl ? new URL(proxyUrl) : null

  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {Object<string, any>} [options.headers]
   * @param {string | undefined} [options.method]
   * @returns {ReturnType<createRequest>}
   */
  async function request({ url, headers = {}, method = 'GET' }) {
    const headersCopy = { ...headers }
    const absoluteUrl = getAbsoluteUrl(url)

    for (const [key, value] of Object.entries(overwriteRequestHeaders)) {
      if (value === null || value === undefined) {
        delete headersCopy[key]
      } else {
        headersCopy[key] = value
      }
    }

    // When using a proxy, rewrite the URL to go through it
    const requestUrl = parsedProxyUrl
      ? rewriteUrlForProxy(absoluteUrl, parsedProxyUrl)
      : absoluteUrl

    const [req, responsePromise] = await createRequest({
      url: requestUrl,
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

/**
 * @param {string} absoluteUrl
 * @param {URL} parsedProxyUrl
 * @returns {string}
 */
function rewriteUrlForProxy(absoluteUrl, parsedProxyUrl) {
  const original = new URL(absoluteUrl)
  original.protocol = parsedProxyUrl.protocol
  original.hostname = parsedProxyUrl.hostname
  original.port = parsedProxyUrl.port
  return original.toString()
}

export { createOrigin }
