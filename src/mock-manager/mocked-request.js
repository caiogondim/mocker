/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {import('../shared/types.js').HttpMethod} HttpMethod */

import { PassThrough } from 'node:stream'
import { HTTP_METHOD } from '../shared/http-method/index.js'

class MockedRequest extends PassThrough {
  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {Headers} [options.headers]
   * @param {HttpMethod} [options.method]
   */
  constructor({ url, method = HTTP_METHOD.GET, headers = {} }) {
    super()

    /** @readonly */
    this.headers = headers

    /** @readonly */
    this.method = method

    /** @readonly */
    this.url = url
  }
}

export default MockedRequest
