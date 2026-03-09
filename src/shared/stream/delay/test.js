import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Readable, Transform, PassThrough } from 'node:stream'
import pipeline from '../pipeline/index.js'
import delay from './index.js'

describe('delay', () => {
  it('delays the start of its readable stream', async () => {
    const input = ['lorem']
    const t1 = Date.now()
    await pipeline(Readable.from(input), delay({ ms: 2000 }))
    const t2 = Date.now()

    assert.ok(t2 - t1 >= 2000)
    assert.ok(t2 - t1 <= 3000)
  })

  // Regression test to prevent a delay on each chunk of a stream
  it('delays only the first chunk of a stream', async () => {
    const input = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']
    const t1 = Date.now()
    await pipeline(Readable.from(input), delay({ ms: 2000 }))
    const t2 = Date.now()

    assert.ok(t2 - t1 >= 2000)
    assert.ok(t2 - t1 <= 3000)
  })

  it('behaves as a PassThrough stream', async () => {
    const input = ['lorem', 'ipsum']

    /** @type {string[]} */
    const output = []

    await pipeline(
      Readable.from(input),
      delay({ ms: 0 }),
      new Transform({
        transform(chunk, encoding, callback) {
          output.push(chunk.toString('utf8'))
          callback(null, chunk)
        },
      }),
    )

    assert.deepStrictEqual(output.join(''), input.join(''))
  })

  it('returns a vanilla PassThrough stream if delay equals 0', () => {
    const stream = delay({ ms: 0 })

    assert.deepStrictEqual(stream.constructor, PassThrough)
  })
})
