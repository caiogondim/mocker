const { Transform, PassThrough } = require('stream')

// https://en.wikipedia.org/wiki/Token_bucket
class TokenBucket {
  /**
   * @param {Object} options
   * @param {number} options.capacity
   * @param {number} options.fillFrequency
   */
  constructor({ capacity, fillFrequency }) {
    /**
     * @private
     *
     * @readonly
     */
    this._capacity = capacity

    /**
     * @private
     *
     * @readonly
     */
    this._fillFrequency = fillFrequency

    /**
     * @private
     * @type {number}
     */
    this._tokens = 0

    /**
     * @private
     *
     * @type {null | typeof setTimeout}
     */
    this._interval = null

    /** @private */
    this._refillResolve = () => {}

    /** @private */
    this._isInitialized = false

    /** @private */
    this._hasPendingRefill = false
  }

  /** @returns {number} */
  get tokens() {
    return this._tokens
  }

  /**
   * @param {number} quantity
   * @returns {Boolean}
   */
  take(quantity) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw TypeError('quantity must be a positive integer')
    }

    if (!this._hasPendingRefill) {
      this._hasPendingRefill = true
      setTimeout(() => this._fill(), 1000 / this._fillFrequency)
    }

    if (quantity <= this._tokens) {
      this._tokens -= quantity
      return true
    }
    return false
  }

  /** @returns {Promise<void>} */
  async refill() {
    if (this._capacity === this._tokens) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this._refillResolve = resolve
    })
  }

  /**
   * @private
   * @returns {void}
   */
  _fill() {
    this._tokens = this._capacity
    this._hasPendingRefill = false
    this._refillResolve()
  }
}

/**
 * Throttles a stream pipeline.
 *
 * @param {Object} options
 * @param {number} options.bps
 * @returns {Transform}
 */
function throttle({ bps }) {
  if (bps === Infinity) {
    return new PassThrough()
  }

  const tokenBucket = new TokenBucket({ capacity: bps, fillFrequency: 1 })
  const stream = new Transform({
    async transform(data, encoding, callback) {
      try {
        for (let chunkStart = 0; chunkStart < data.length; chunkStart += bps) {
          const chunkEnd = Math.min(data.length, chunkStart + bps + 1)
          const chunkSize = chunkEnd - chunkStart
          if (!tokenBucket.take(chunkSize)) {
            await tokenBucket.refill()
            chunkStart -= bps
            continue
          }
          this.push(data.slice(chunkStart, chunkEnd))
        }
        return callback(null)
      } catch (error) {
        return callback(error)
      }
    },
  })
  return stream
}

module.exports = throttle
