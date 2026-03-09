import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import sleep from '../../sleep/index.js'
import retry from './index.js'

async function backoff() {}

/**
 * @param {number} n
 * @returns {function(): Promise<string>}
 */
function createThrowUntilN(n) {
  let callCount = 0
  return async () => {
    callCount += 1
    if (callCount < n) {
      throw new Error()
    } else {
      return 'lorem'
    }
  }
}

describe('retry', () => {
  it('retries if thunk throws error', async () => {
    //
    // Test behavior without `retry`
    //

    const throwUntil3 = createThrowUntilN(3)
    await assert.rejects(throwUntil3(), Error)
    await assert.rejects(throwUntil3(), Error)
    assert.strictEqual(await throwUntil3(), 'lorem')

    //
    // Test behavior with `retry`
    //

    assert.strictEqual(
      await retry(createThrowUntilN(3), { backoff }),
      'lorem',
    )
  })

  it('retries up to `retries`', async () => {
    await assert.rejects(
      retry(createThrowUntilN(3), { retries: 2, backoff }),
      Error,
    )
  })

  it('retries in case `shouldRetry` returns true', async () => {
    function createNumberGenerator() {
      let num = 0
      return async () => {
        num += 1
        await sleep(100)
        return num
      }
    }
    const numberGenerator = createNumberGenerator()

    /**
     * @param {number} num
     * @returns {boolean}
     */
    function shouldRetry(num) {
      return num < 2
    }

    assert.strictEqual(
      await retry(numberGenerator, { shouldRetry, backoff }),
      2,
    )
  })

  it('executes `onRetry` on each retry', async () => {
    const retries = 3
    let onRetryCalls = 0
    function onRetry() {
      onRetryCalls += 1
    }
    const throwUntil3 = createThrowUntilN(3)
    await retry(throwUntil3, { onRetry, retries, backoff })
    assert.strictEqual(onRetryCalls, retries - 1)
  })

  it('backs off between each retry', async () => {
    const retries = 3
    const throwUntil3 = createThrowUntilN(3)
    // Passing a mock since we are not testing the backoff behavior
    const mockBackoff = mock.fn()

    const result = await retry(throwUntil3, { retries, backoff: mockBackoff })

    assert.strictEqual(result, 'lorem')
    assert.strictEqual(mockBackoff.mock.calls.length, 2)
  })
})
