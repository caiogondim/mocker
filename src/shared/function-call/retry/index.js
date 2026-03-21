/** @template T @template {Error} [E=Error] @typedef {import('../../types.js').Result<T, E>} Result */

import createBackoff from '../../backoff/index.js'

/**
 * @template T
 * @param {function(): Promise<T>} asyncThunk
 * @param {function(T): boolean} shouldRetry
 * @param {function(): void} onRetry
 * @returns {Promise<{ done: true; value: T } | { done: false }>}
 */
async function attempt(asyncThunk, shouldRetry, onRetry) {
  const value = await asyncThunk()
  if (!shouldRetry(value)) {
    return { done: true, value }
  }
  onRetry()
  return { done: false }
}

/**
 * @template T
 * @param {function(): Promise<T>} asyncThunk
 * @param {Object} options
 * @param {number} [options.retries]
 * @param {function(T): boolean} [options.shouldRetry]
 * @param {function(): void} [options.onRetry]
 * @param {function(): Promise<void>} [options.backoff]
 * @returns {Promise<Result<T>>}
 */
async function retry(
  asyncThunk,
  {
    retries = 3,
    shouldRetry = () => false,
    onRetry = () => {},
    backoff = createBackoff(),
  } = {},
) {
  for (let attempts = 0; attempts < retries; attempts += 1) {
    try {
      const result = await attempt(asyncThunk, shouldRetry, onRetry)
      if (result.done)
        return { ok: true, value: /** @type {T} */ (result.value) }
    } catch (error) {
      if (attempts === retries - 1)
        return { ok: false, error: /** @type {Error} */ (error) }
      onRetry()
    }
    await backoff()
  }

  return {
    ok: false,
    error: new Error(
      'retry exhausted all attempts without a successful response',
    ),
  }
}

export default retry
