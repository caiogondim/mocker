/** @typedef {import('../shared/http').Headers} Headers */

const { Transform } = require('stream')

class MockedResponse extends Transform {
  /**
   * @param {Object} options
   * @param {number} options.statusCode
   * @param {Headers} [options.headers]
   * @param {string} options.url
   * @param {string} [options.connectionId]
   */
  constructor({ statusCode, headers = {}, url, connectionId = '?' }) {
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

  /**
   * @param {Buffer} chunk
   * @param {string} encoding
   * @param {Function} callback
   * @returns {void}
   */
  _transform(chunk, encoding, callback) {
    callback(null, chunk)
  }
}

module.exports = MockedResponse
