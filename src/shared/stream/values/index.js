/**
 * @template T
 * @param {AsyncIterable<T> | Iterable<T>} stream
 * @returns {Promise<T[]>}
 */
async function values(stream) {
  /** @type {T[]} */
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

export default values
