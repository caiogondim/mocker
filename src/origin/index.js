/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {import('../shared/types.js').AbsoluteHttpUrl} AbsoluteHttpUrl */
/** @typedef {import('../args/types.js').HttpUrl} HttpUrl */
/** @typedef {import('../args/types.js').NonNegativeInteger} NonNegativeInteger */
/** @typedef {import('../shared/types.js').HttpMethod} HttpMethod */

import { createRequest } from '../shared/http/index.js'
import { HTTP_METHOD } from '../shared/http-method/index.js'

/**
 * @param {Object} options
 * @param {HttpUrl} options.host
 * @param {NonNegativeInteger} [options.retries]
 * @param {Headers} [options.overwriteRequestHeaders]
 * @param {HttpUrl} [options.proxyUrl]
 */
function createOrigin({
  host,
  retries = /** @type {NonNegativeInteger} */ (0),
  overwriteRequestHeaders = {},
  proxyUrl,
}) {
  const parsedProxyUrl = proxyUrl ? new URL(proxyUrl) : null

  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {Headers} [options.headers]
   * @param {HttpMethod} [options.method]
   * @returns {ReturnType<createRequest>}
   */
  async function request({ url, headers = {}, method = HTTP_METHOD.GET }) {
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

    const result = await createRequest({
      url: requestUrl,
      headers: headersCopy,
      method,
      retries,
    })

    if (!result.ok) {
      return result
    }

    return { ok: true, value: result.value }
  }

  /**
   * @param {string} url
   * @returns {AbsoluteHttpUrl}
   */
  function getAbsoluteUrl(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return /** @type {AbsoluteHttpUrl} */ (url)
    }
    return /** @type {AbsoluteHttpUrl} */ (`${host}${url}`)
  }

  return { request }
}

/**
 * @param {AbsoluteHttpUrl} absoluteUrl
 * @param {URL} parsedProxyUrl
 * @returns {AbsoluteHttpUrl}
 */
function rewriteUrlForProxy(absoluteUrl, parsedProxyUrl) {
  const original = new URL(absoluteUrl)
  original.protocol = parsedProxyUrl.protocol
  original.hostname = parsedProxyUrl.hostname
  original.port = parsedProxyUrl.port
  return /** @type {AbsoluteHttpUrl} */ (original.toString())
}

export { createOrigin }
