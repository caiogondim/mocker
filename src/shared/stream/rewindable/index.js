/** @typedef {import('./types.js').Rewindable} Rewindable */
/** @template T @template {Error} [E=Error] @typedef {import('../../types.js').Result<T, E>} Result */

import { Readable } from 'node:stream'

const DEFAULT_MAX_BUFFER_BYTES = 64 * 1024 * 1024 // 64MB

/**
 * @param {number} maxBufferBytes
 * @returns {Error}
 */
function createBufferLimitError(maxBufferBytes) {
  return new Error(
    `Rewindable stream exceeded max buffer size of ${maxBufferBytes} bytes.`,
  )
}

/**
 * @param {Readable} stream
 * @param {AbortSignal} signal
 * @param {() => Error} getReleaseError
 * @returns {Promise<undefined>}
 */
function waitForNewChunkOrEnd(stream, signal, getReleaseError) {
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
      reject(getReleaseError())
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
 * @param {{ maxBufferBytes?: number }} [options]
 * @returns {Result<T & Rewindable, Error>}
 */
function rewindable(stream, options = {}) {
  const { maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES } = options

  if (!stream.readable) {
    return { ok: false, error: new Error('Stream is not readable') }
  }
  if (!Number.isInteger(maxBufferBytes) || maxBufferBytes <= 0) {
    return {
      ok: false,
      error: new TypeError('maxBufferBytes must be a positive integer'),
    }
  }

  // Saves all generated values by the stream for future playback, but making
  // sure to not start it to flow.

  /** @type {Buffer[]} */
  const chunks = []
  let bufferedBytes = 0
  let releaseError = new Error('Rewindable stream was already released')

  /** @param {Buffer} chunk */
  function onData(chunk) {
    bufferedBytes += chunk.byteLength
    if (bufferedBytes > maxBufferBytes) {
      const error = createBufferLimitError(maxBufferBytes)
      release(error)
      stream.destroy()
      return
    }
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

  /**
   * @param {Error} [reason]
   */
  function release(reason) {
    if (isReleased) {
      return
    }

    isReleased = true
    if (reason) {
      releaseError = reason
    }
    chunks.length = 0
    bufferedBytes = 0
    releaseController.abort()
    stream.removeListener('data', onData)
  }

  function rewind() {
    if (isReleased) {
      throw releaseError
    }

    let lastConsumedIndex = -1

    // Put the stream into flowing mode in case it wasn't already.
    stream.resume()

    async function* generator() {
      for (;;) {
        if (isReleased) {
          throw releaseError
        }

        const allChunksWereConsumed = lastConsumedIndex === chunks.length - 1

        if (allChunksWereConsumed && isStreamEnded) {
          return
        }

        // In case all chunks from buffer was consumed, wait for a new chunk.
        if (allChunksWereConsumed && !isStreamEnded) {
          await waitForNewChunkOrEnd(
            stream,
            releaseController.signal,
            () => releaseError,
          )
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
