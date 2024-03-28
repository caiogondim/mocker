const createBackoff = require('../../backoff')

/**
 * @param {function(): Promise<any>} asyncThunk
 * @param {Object} options
 * @param {Number} [options.retries]
 * @param {function(any): boolean} [options.shouldRetry]
 * @param {function(): void} [options.onRetry]
 * @param {function(): Promise<void>} [options.backoff]
 * @returns {ReturnType<asyncThunk>}
 */
async function retry(
  asyncThunk,
  {
    retries = 3,
    shouldRetry = () => false,
    onRetry = () => {},
    backoff = createBackoff(),
  } = {}
) {
  let response

  for (let attempts = 0; attempts < retries; attempts += 1) {
    try {
      response = await asyncThunk()
      if (!shouldRetry(response)) {
        return response
      }
      onRetry()
    } catch (error) {
      if (attempts === retries - 1) {
        throw error
      } else {
        onRetry()
      }
    }

    await backoff()
  }

  return response
}

module.exports = retry
