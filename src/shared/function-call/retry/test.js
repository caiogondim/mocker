const sleep = require('../../sleep')
const retry = require('.')

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
    expect.assertions(4)

    //
    // Test behavior without `retry`
    //

    const throwUntil3 = createThrowUntilN(3)
    await expect(throwUntil3()).rejects.toThrow(Error)
    await expect(throwUntil3()).rejects.toThrow(Error)
    await expect(throwUntil3()).resolves.toStrictEqual('lorem')

    //
    // Test behavior with `retry`
    //

    await expect(
      retry(createThrowUntilN(3), { backoff })
    ).resolves.toStrictEqual('lorem')
  })

  it('retries up to `retries`', async () => {
    expect.assertions(1)
    await expect(
      retry(createThrowUntilN(3), { retries: 2, backoff })
    ).rejects.toThrow(Error)
  })

  it('retries in case `shouldRetry` returns true', async () => {
    expect.assertions(1)

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

    await expect(
      retry(numberGenerator, { shouldRetry, backoff })
    ).resolves.toBe(2)
  })

  it('executes `onRetry` on each retry', async () => {
    expect.assertions(1)

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
    expect.assertions(2)

    const retries = 3
    const throwUntil3 = createThrowUntilN(3)
    // Passing a mock since we are not testing the backoff behavior
    const mockBackoff = jest.fn()

    const result = await retry(throwUntil3, { retries, backoff: mockBackoff })

    expect(result).toStrictEqual('lorem')
    expect(mockBackoff).toHaveBeenCalledTimes(2)
  })
})
