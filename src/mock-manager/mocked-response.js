/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {import('../shared/types.js').ConnectionId} ConnectionId */
/** @typedef {import('../shared/types.js').HttpStatusCode} HttpStatusCode */

import { PassThrough } from 'node:stream'

class MockedResponse extends PassThrough {
  /**
   * @param {Object} options
   * @param {HttpStatusCode} options.statusCode
   * @param {Headers} [options.headers]
   * @param {string} options.url
   * @param {ConnectionId} [options.connectionId]
   */
  constructor({
    statusCode,
    headers = {},
    url,
    connectionId = /** @type {ConnectionId} */ ('?'),
  }) {
    super()

    /** @readonly */
    this.statusCode = statusCode

    /** @readonly */
    this.headers = headers

    /** @readonly */
    this.url = url

    /** @readonly */
    this.connectionId = connectionId
  }
}

export default MockedResponse
