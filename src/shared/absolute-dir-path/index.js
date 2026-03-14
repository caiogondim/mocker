/** @typedef {import('../types.js').AbsoluteDirPath} AbsoluteDirPath */

import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tryCatchAsync } from '../try-catch/index.js'

/**
 * @param {string} input
 * @returns {Promise<import("../types.js").Result<AbsoluteDirPath>>}
 */
async function parse(input) {
  if (input === '') {
    return {
      ok: false,
      error: new TypeError(`Expected a valid directory path, got: "${input}"`),
    }
  }

  const result = await tryCatchAsync(() => fs.stat(input))

  if (!result.ok || !result.value.isDirectory()) {
    return {
      ok: false,
      error: new TypeError(
        `Expected an accessible directory path, got: "${input}"`,
      ),
    }
  }

  return {
    ok: true,
    value: /** @type {AbsoluteDirPath} */ (path.resolve(input)),
  }
}

export { parse }
