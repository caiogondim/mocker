const { Transform } = require('stream')

function createDeferred() {
  // eslint-disable-next-line no-unused-vars
  let resolve = (/** @type {any} */ value) => {}
  // eslint-disable-next-line no-unused-vars
  let reject = (/** @type {any} */ value) => {}
  const promise = new Promise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  return { resolve, reject, promise }
}

/** @returns {[Transform, Promise<Buffer[]>]} */
function createPassAndSave() {
  const { resolve, reject, promise: contentPromise } = createDeferred()
  /** @type {Buffer[]} */
  const chunks = []

  const stream = new Transform({
    async transform(data, encoding, callback) {
      try {
        chunks.push(data)
        this.push(data)
        return callback(null)
      } catch (error) {
        reject(error)
        throw error
      }
    },
    flush(callback) {
      resolve(chunks)
      return callback()
    },
  })

  return [stream, contentPromise]
}

module.exports = createPassAndSave
