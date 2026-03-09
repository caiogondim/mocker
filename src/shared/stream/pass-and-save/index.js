import { Transform } from 'node:stream'

/** @returns {[Transform, Promise<Buffer[]>]} */
function createPassAndSave() {
  /** @type {function(any): void} */
  let resolve
  /** @type {function(any): void} */
  let reject
  const contentPromise = new Promise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })
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

export default createPassAndSave
