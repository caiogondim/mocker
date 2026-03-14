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
  const stream = new Transform({
    async transform(chunk, encoding, callback) {
      try {
        if (isFirstChunk) {
          await sleep(ms)
          isFirstChunk = false
        }
        return callback(null, chunk)
      } catch (error) {
        return callback(
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    },
    flush(callback) {
      isFirstChunk = true
      callback()
    },
  })
  return stream
}

export default delay
