/** @typedef {import('../shared/http').Headers} Headers */

const { Transform } = require('stream')

class MockedRequest extends Transform {
  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {Headers} [options.headers]
   * @param {String} [options.method]
   */
  constructor({ url, method = 'GET', headers = {} }) {
    super()

    /** @readonly */
    this.headers = headers

    /** @readonly */
    this.method = method

    /** @readonly */
    this.url = url
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

module.exports = MockedRequest
