import { Transform } from 'node:stream'

/** @returns {[Transform, Promise<Buffer[]>]} */
function createPassAndSave() {
  const { resolve, reject, promise: contentPromise } = Promise.withResolvers()
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
