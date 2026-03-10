import { describe, it, expect, jest } from '@jest/globals'
import { setTimeout as sleep } from 'node:timers/promises'
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
    await expect(throwUntil3()).rejects.toThrow(Error)
    await expect(throwUntil3()).rejects.toThrow(Error)
    expect(await throwUntil3()).toBe('lorem')

    //
    // Test behavior with `retry`
    //

    expect(await retry(createThrowUntilN(3), { backoff })).toBe('lorem')
  })

  it('retries up to `retries`', async () => {
    await expect(
      retry(createThrowUntilN(3), { retries: 2, backoff }),
    ).rejects.toThrow(Error)
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

    expect(await retry(numberGenerator, { shouldRetry, backoff })).toBe(2)
  })

  it('executes `onRetry` on each retry', async () => {
    const retries = 3
    let onRetryCalls = 0
    function onRetry() {
      onRetryCalls += 1
    }
    const throwUntil3 = createThrowUntilN(3)
    await retry(throwUntil3, { onRetry, retries, backoff })
    expect(onRetryCalls).toBe(retries - 1)
  })

  it('backs off between each retry', async () => {
    const retries = 3
    const throwUntil3 = createThrowUntilN(3)
    // Passing a mock since we are not testing the backoff behavior
    /** @type {jest.Mock<() => Promise<void>>} */
    const mockBackoff = jest.fn()

    const result = await retry(throwUntil3, { retries, backoff: mockBackoff })

    expect(result).toBe('lorem')
    expect(mockBackoff).toHaveBeenCalledTimes(2)
  })
})
