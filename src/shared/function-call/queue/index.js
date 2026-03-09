/**
 * @template T
 * @param {Function} fn
 * @returns Promise<<ReturnType<T>>>
 */
function queueCalls(fn) {
  /** @type {any[]} */
  const queue = []

  async function loop() {
    if (queue.length === 0) return

    const [thunk, resolve, reject] = queue.shift()
    try {
      resolve(await thunk())
    } catch (error) {
      reject(error)
    }

    setTimeout(loop, 0).unref()
  }

  /**
   * @param {any[]} args
   * @returns {Promise<any>}
   */
  async function decoratedFn(...args) {
    const promise = new Promise((resolve, reject) => {
      queue.push([() => fn(...args), resolve, reject])
    })

    if (queue.length === 1) {
      setTimeout(loop, 0).unref()
    }

    return promise
  }

  Object.defineProperty(decoratedFn, 'name', {
    value: `queueCalls(${fn.name})`,
  })

  return decoratedFn
}

export default queueCalls
