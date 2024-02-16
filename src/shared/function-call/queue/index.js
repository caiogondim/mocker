class Queue {
  constructor() {
    /**
     * @private
     * @type {any[]}
     */
    this._queue = []
  }

  /** @param {any} val */
  add(val) {
    this._queue.push(val)
  }

  remove() {
    return this._queue.shift()
  }

  peek() {
    return this._queue[this._queue.length - 1]
  }

  get length() {
    return this._queue.length
  }
}

/**
 * @template T
 * @param {Function} fn
 * @returns Promise<<ReturnType<T>>>
 */
function queueCalls(fn) {
  const queue = new Queue()

  async function loop() {
    if (queue.length === 0) return

    const [thunk, resolve, reject] = queue.remove()
    try {
      resolve(await thunk())
    } catch (error) {
      reject(error)
    }

    setTimeout(loop, 0)
  }

  /**
   * @param {any[]} args
   * @returns {Promise<any>}
   */
  async function decoratedFn(...args) {
    const promise = new Promise((resolve, reject) => {
      queue.add([() => fn(...args), resolve, reject])
    })

    if (queue.length === 1) {
      setTimeout(loop, 0)
    }

    return promise
  }

  Object.defineProperty(decoratedFn, 'name', {
    value: `queueCalls(${fn.name})`,
  })

  return decoratedFn
}

module.exports = queueCalls
