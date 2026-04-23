/**
 * @template {(...args: never[]) => unknown} T
 * @param {T} fn
 * @returns {T}
 */
function queueCalls(fn) {
  /** @type {Array<[() => unknown, (value: unknown) => void, (error: unknown) => void]>} */
  const queue = []

  async function loop() {
    if (queue.length === 0) return

    const [thunk, resolve, reject] =
      /** @type {[() => unknown, (value: unknown) => void, (error: unknown) => void]} */ (
        queue.shift()
      )
    try {
      resolve(await thunk())
    } catch (error) {
      reject(error)
    }

    setImmediate(loop)
  }

  /** @param {Parameters<T>} args */
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

  return /** @type {T} */ (/** @type {unknown} */ (decoratedFn))
}

export default queueCalls
