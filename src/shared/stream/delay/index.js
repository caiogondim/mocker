import { PassThrough, Transform } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * @param {Object} options
 * @param {number} options.ms
 * @returns {Transform}
 */
function delay({ ms }) {
  if (ms === 0) {
    return new PassThrough()
  }

  let isFirstChunk = true
  const ac = new AbortController()
  const stream = new Transform({
    async transform(chunk, encoding, callback) {
      try {
        if (isFirstChunk) {
          await sleep(ms, undefined, { signal: ac.signal })
          isFirstChunk = false
        }
        return callback(null, chunk)
      } catch (error) {
        if (/** @type {Error} */ (error).name === 'AbortError') {
          return callback()
        }
        return callback(
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    },
    flush(callback) {
      isFirstChunk = true
      callback()
    },
    destroy(error, callback) {
      ac.abort()
      callback(error)
    },
  })
  return stream
}

export default delay
