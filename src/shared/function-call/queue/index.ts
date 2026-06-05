function queueCalls<T extends (...args: never[]) => unknown>(fn: T): T {
  const queue: Array<
    [() => unknown, (value: unknown) => void, (error: unknown) => void]
  > = []

  async function loop() {
    if (queue.length === 0) return

    const [thunk, resolve, reject] = queue.shift() as [
      () => unknown,
      (value: unknown) => void,
      (error: unknown) => void,
    ]
    try {
      resolve(await thunk())
    } catch (error) {
      reject(error)
    }

    setImmediate(loop)
  }

  async function decoratedFn(...args: Parameters<T>) {
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

  return decoratedFn as unknown as T
}

export default queueCalls
