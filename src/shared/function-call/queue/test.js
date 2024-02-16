const queueCalls = require('./index')

describe('queue', () => {
  it('enqueues calls to decorated function', async () => {
    expect.assertions(10)

    let counter = 0
    function count() {
      return new Promise((resolve) => {
        counter += 1
        setTimeout(resolve, 100)
      })
    }

    //
    // Original behavior for `count` function
    //

    const promise1 = count()
    expect(counter).toStrictEqual(1)
    const promise2 = count()
    expect(counter).toStrictEqual(2)
    const promise3 = count()
    expect(counter).toStrictEqual(3)
    const promise4 = count()
    expect(counter).toStrictEqual(4)
    await Promise.all([promise1, promise2, promise3, promise4])
    expect(counter).toStrictEqual(4)

    //
    // Decorated `count`
    //

    counter = 0
    const queuedCount = queueCalls(count)
    const promise5 = queuedCount()
    expect(counter).toStrictEqual(0)
    const promise6 = queuedCount()
    expect(counter).toStrictEqual(0)
    const promise7 = queuedCount()
    expect(counter).toStrictEqual(0)
    const promise8 = queuedCount()
    expect(counter).toStrictEqual(0)
    await Promise.all([promise5, promise6, promise7, promise8])
    expect(counter).toStrictEqual(4)
  })

  it('has a function name that describes decorator and encapsulated function names', async () => {
    expect.assertions(2)

    /**
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    function sum(a, b) {
      return a + b
    }

    expect(sum.name).toStrictEqual('sum')
    expect(queueCalls(sum).name).toStrictEqual('queueCalls(sum)')
  })
})
