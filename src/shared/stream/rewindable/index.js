/** @typedef {import('./types.js').Rewindable} Rewindable */
/** @template T @template {Error} [E=Error] @typedef {import('../../types.js').Result<T, E>} Result */

import { Readable } from 'node:stream'

/**
 * @param {Readable} stream
 * @param {AbortSignal} signal
 * @returns {Promise<undefined>}
 */
function waitForNewChunkOrEnd(stream, signal) {
  return new Promise((resolve, reject) => {
    function onDataOrEnd() {
      cleanup()
      resolve(undefined)
    }

    /** @param {unknown} error */
    function onError(error) {
      cleanup()
      reject(error)
    }

    function onAbort() {
      cleanup()
      reject(new Error('Rewindable stream was already released'))
    }

    function cleanup() {
      // Remove all event listeners related to this promise to
      // avoid memory leaks.
      stream.removeListener('end', onDataOrEnd)
      stream.removeListener('close', onDataOrEnd)
      stream.removeListener('data', onDataOrEnd)
      stream.removeListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    // In case we have consumed all chunks from buffer and the
    // stream is finished, we have to wait for the `end` event
    // here.
    stream.once('end', onDataOrEnd)
    stream.once('close', onDataOrEnd)
    stream.once('data', onDataOrEnd)
    stream.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * @template {Readable} T
 * @param {T} stream
 * @returns {Result<T & Rewindable, Error>}
 */
function rewindable(stream) {
  if (!stream.readable) {
    return { ok: false, error: new Error('Stream is not readable') }
  }

  // Saves all generated values by the stream for future playback, but making
  // sure to not start it to flow.

  /** @type {Buffer[]} */
  const chunks = []

  /** @param {Buffer} chunk */
  function onData(chunk) {
    chunks.push(chunk)
  }

  stream.on('data', onData)

  // Decorating the source stream shouldn't put the stream into flowing mode.
  stream.pause()

  let isStreamEnded = false
  let isReleased = false
  const releaseController = new AbortController()

  function onStreamFinished() {
    isStreamEnded = true

    // Removes all listeners to avoid a memory leak.
    stream.removeListener('data', onData)
  }

  stream.once('end', onStreamFinished)
  stream.once('close', onStreamFinished)

  function release() {
    if (isReleased) {
      return
    }

    isReleased = true
    chunks.length = 0
    releaseController.abort()
    stream.removeListener('data', onData)
  }

  function rewind() {
    if (isReleased) {
      throw new Error('Rewindable stream was already released')
    }

    let lastConsumedIndex = -1

    // Put the stream into flowing mode in case it wasn't already.
    stream.resume()

    async function* generator() {
      for (;;) {
        if (isReleased) {
          throw new Error('Rewindable stream was already released')
        }

        const allChunksWereConsumed = lastConsumedIndex === chunks.length - 1

        if (allChunksWereConsumed && isStreamEnded) {
          return
        }

        // In case all chunks from buffer was consumed, wait for a new chunk.
        if (allChunksWereConsumed && !isStreamEnded) {
          await waitForNewChunkOrEnd(stream, releaseController.signal)
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

  async function asyncDispose() {
    release()
  }

  function dispose() {
    release()
  }

  // Set `stream` as prototype of a newly created object so we extend without
  // mutating.
  return {
    ok: true,
    value: Object.setPrototypeOf(
      {
        rewind,
        release,
        [Symbol.dispose]: dispose,
        [Symbol.asyncDispose]: asyncDispose,
      },
      stream,
    ),
  }
}

export default rewindable
