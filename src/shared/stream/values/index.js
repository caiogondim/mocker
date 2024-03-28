/** @typedef {import('../../types').StreamReadable} StreamReadable */

/**
 * @param {AsyncIterable<any> | Iterable<any>} stream
 * @returns {Promise<any[]>}
 */
async function values(stream) {
  /** @type {any[]} */
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

module.exports = values
