/** @template T @template {Error} [E=Error] @typedef {import('../types.js').Result<T, E>} Result */
/** @typedef {import('../types.js').FsLike} FsLike */

import nativeFs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pipeline } from '../stream/index.js'
import { Readable } from 'node:stream'

/**
 * @param {Object} options
 * @param {string} options.filePath
 * @param {string} options.content
 * @param {FsLike} [options.fs]
 * @returns {Promise<Result<void>>}
 */
async function atomicWrite({ filePath, content, fs = nativeFs }) {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  const {
    createWriteStream,
    promises: { rename, unlink },
  } = fs

  try {
    await pipeline(
      Readable.from(content),
      createWriteStream(tmpPath, { autoClose: true }),
    )
    await rename(tmpPath, filePath)
    return { ok: true, value: undefined }
  } catch (error) {
    try {
      await unlink(tmpPath)
    } catch {
      // Best-effort cleanup; ignore errors
    }
    return { ok: false, error: /** @type {Error} */ (error) }
  }
}

export default atomicWrite
