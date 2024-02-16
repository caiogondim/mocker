const { PassThrough, Transform } = require('stream')
const sleep = require('../../sleep')

/**
 * Adds an artifical delay to a stream pipeline.
 *
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
        return callback(error)
      }
    },
    flush(callback) {
      isFirstChunk = true
      callback()
    },
  })
  return stream
}

module.exports = delay
