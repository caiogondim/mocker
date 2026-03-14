/**
 * @template T
 * @param {Function} fn
 * @returns Promise<<ReturnType<T>>>
 */
function queueCalls(fn) {
  /** @type {Array<[() => unknown, (value: unknown) => void, (error: unknown) => void]>} */
  const queue = []

  async function loop() {
    if (queue.length === 0) return

    const [thunk, resolve, reject] = /** @type {[() => unknown, (value: unknown) => void, (error: unknown) => void]} */ (queue.shift())
    try {
      resolve(await thunk())
    } catch (error) {
      reject(error)
    }

    setImmediate(loop)
  }

  /**
   * @param {...unknown} args
   * @returns {Promise<unknown>}
   */
  async function decoratedFn(...args) {
    const promise = new Promise((resolve, reject) => {
      queue.push([() => fn(...args), resolve, reject])
    })

    if (queue.length === 1) {
      setImmediate(loop)
    }

    return promise
  }

  Object.defineProperty(decoratedFn, 'name', {
    value: `queueCalls(${fn.name})`,
  })

  return decoratedFn
}

export default queueCalls
