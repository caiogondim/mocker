/** @typedef {import('./types').Rewindable} Rewindable */

const { Readable } = require('stream')

/**
 * @param {Readable} stream
 * @returns {Promise<undefined>}
 */
function waitForNewChunkOrEnd(stream) {
  return new Promise((resolve) => {
    function onDataOrEnd() {
      // Remove all event listeners related to this promise to
      // avoid memory leaks.
      stream.removeListener('end', onDataOrEnd)
      stream.removeListener('data', onDataOrEnd)
      resolve(undefined)
    }

    // In case we have consumed all chunks from buffer and the
    // stream is finished, we have to wait for the `end` event
    // here.
    stream.once('end', onDataOrEnd)
    stream.once('data', onDataOrEnd)
  })
}

/**
 * @template {Readable} T
 * @param {T} stream
 * @returns {T & Rewindable}
 */
function rewindable(stream) {
  if (!stream.readable) {
    throw new Error('Stream is not readable')
  }

  // Saves all generated values by the stream for future playback, but making
  // sure to not start it to flow.

  /** @type {any[]} */
  const chunks = []

  /** @param {any} chunk */
  function onData(chunk) {
    chunks.push(chunk)
  }

  stream.on('data', onData)

  // Decorating the source stream shouldn't put the stream into flowing mode.
  stream.pause()

  let isStreamEnded = false

  stream.once('end', () => {
    isStreamEnded = true

    // Removes all listeners to avoid a memory leak.
    stream.removeListener('data', onData)
  })

  function rewind() {
    let lastConsumedIndex = -1

    // Put the stream into flowing mode in case it wasn't already.
    stream.resume()

    async function* generator() {
      for (;;) {
        const allChunksWereConsumed = lastConsumedIndex === chunks.length - 1

        if (allChunksWereConsumed && isStreamEnded) {
          return
        }

        // In case all chunks from buffer was consumed, wait for a new chunk.
        if (allChunksWereConsumed && !isStreamEnded) {
          await waitForNewChunkOrEnd(stream)
          continue
        }

        const value = chunks[lastConsumedIndex + 1]
        lastConsumedIndex += 1

        yield value
      }
    }

    // Using an AsyncGenerator under the hood since it's easier to
    // reason about.
    return Readable.from(generator())
  }

  // Set `stream` as prototype of a newly created object so we extend without
  // mutating.
  return Object.setPrototypeOf({ rewind }, stream)
}

module.exports = rewindable
