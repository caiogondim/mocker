import { Transform, PassThrough } from 'node:stream'

// https://en.wikipedia.org/wiki/Token_bucket
class TokenBucket {
  /** @type {number} */
  #capacity
  /** @type {number} */
  #fillFrequency
  /** @type {number} */
  #tokens = 0
  /** @type {function(any=): void} */
  #refillResolve = () => {}
  /** @type {boolean} */
  #hasPendingRefill = false

  /**
   * @param {Object} options
   * @param {number} options.capacity
   * @param {number} options.fillFrequency
   */
  constructor({ capacity, fillFrequency }) {
    this.#capacity = capacity
    this.#fillFrequency = fillFrequency
  }

  get tokens() {
    return this.#tokens
  }

  /**
   * @param {number} quantity
   * @returns {boolean}
   */
  take(quantity) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw TypeError('quantity must be a positive integer')
    }

    if (!this.#hasPendingRefill) {
      this.#hasPendingRefill = true
      setTimeout(() => this.#fill(), 1000 / this.#fillFrequency).unref()
    }

    if (quantity <= this.#tokens) {
      this.#tokens -= quantity
      return true
    }
    return false
  }

  async refill() {
    if (this.#capacity === this.#tokens) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.#refillResolve = resolve
    })
  }

  #fill() {
    this.#tokens = this.#capacity
    this.#hasPendingRefill = false
    this.#refillResolve()
  }
}

/**
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
        if (error === null || error === undefined || error instanceof Error) {
          return callback(error)
        } else {
          throw error
        }
      }
    },
  })
  return stream
}

export default throttle
