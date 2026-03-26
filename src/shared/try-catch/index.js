/** @import { Result } from '../types.js' */

/**
 * @template T
 * @param {() => T} fn
 * @returns {Result<T>}
 */
function tryCatch(fn) {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, error: /** @type {Error} */ (error) }
  }
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<Result<T>>}
 */
async function tryCatchAsync(fn) {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, error: /** @type {Error} */ (error) }
  }
}

export { tryCatch, tryCatchAsync }
