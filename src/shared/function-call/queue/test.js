import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import queueCalls from './index.js'

describe('queue', () => {
  it('enqueues calls to decorated function', async () => {
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
    assert.strictEqual(counter, 1)
    const promise2 = count()
    assert.strictEqual(counter, 2)
    const promise3 = count()
    assert.strictEqual(counter, 3)
    const promise4 = count()
    assert.strictEqual(counter, 4)
    await Promise.all([promise1, promise2, promise3, promise4])
    assert.strictEqual(counter, 4)

    //
    // Decorated `count`
    //

    counter = 0
    const queuedCount = queueCalls(count)
    const promise5 = queuedCount()
    assert.strictEqual(counter, 0)
    const promise6 = queuedCount()
    assert.strictEqual(counter, 0)
    const promise7 = queuedCount()
    assert.strictEqual(counter, 0)
    const promise8 = queuedCount()
    assert.strictEqual(counter, 0)
    await Promise.all([promise5, promise6, promise7, promise8])
    assert.strictEqual(counter, 4)
  })

  it('has a function name that describes decorator and encapsulated function names', async () => {
    /**
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    function sum(a, b) {
      return a + b
    }

    assert.strictEqual(sum.name, 'sum')
    assert.strictEqual(queueCalls(sum).name, 'queueCalls(sum)')
  })
})
