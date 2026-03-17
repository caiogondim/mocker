import { Transform, PassThrough } from 'node:stream'

// https://en.wikipedia.org/wiki/Token_bucket
class TokenBucket {
  /** @type {number} */
  #capacity
  /** @type {number} */
  #fillFrequency
  /** @type {number} */
  #tokens = 0
  /** @type {Array<function(unknown=): void>} */
  #refillResolvers = []
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
   * @returns {{ ok: true; value: boolean } | { ok: false; error: TypeError }}
   */
  take(quantity) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        ok: false,
        error: TypeError('quantity must be a positive integer'),
      }
    }

    if (!this.#hasPendingRefill) {
      this.#hasPendingRefill = true
      setTimeout(() => this.#fill(), 1000 / this.#fillFrequency).unref()
    }

    if (quantity <= this.#tokens) {
      this.#tokens -= quantity
      return { ok: true, value: true }
    }
    return { ok: true, value: false }
  }

  async refill() {
    if (this.#capacity === this.#tokens) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.#refillResolvers.push(resolve)
    })
  }

  #fill() {
    this.#tokens = this.#capacity
    this.#hasPendingRefill = false
    for (const resolve of this.#refillResolvers) {
      resolve()
    }
    this.#refillResolvers = []
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

  if (!Number.isInteger(bps) || bps <= 0) {
    throw new TypeError('bps must be a positive integer or Infinity')
  }

  const tokenBucket = new TokenBucket({ capacity: bps, fillFrequency: 1 })
  const stream = new Transform({
    async transform(data, encoding, callback) {
      try {
        for (let chunkStart = 0; chunkStart < data.length; chunkStart += bps) {
          const chunkEnd = Math.min(data.length, chunkStart + bps)
          const chunkSize = chunkEnd - chunkStart
          const takeResult = tokenBucket.take(chunkSize)
          if (!takeResult.ok) {
            return callback(takeResult.error)
          }
          if (!takeResult.value) {
            await tokenBucket.refill()
            chunkStart -= bps
            continue
          }
          this.push(data.slice(chunkStart, chunkEnd))
        }
        return callback(null)
      } catch (error) {
        return callback(
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    },
  })
  return stream
}

export default throttle
