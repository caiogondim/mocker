import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Readable, Transform, PassThrough } from 'node:stream'
import pipeline from '../pipeline/index.js'
import throttle from './index.js'

describe('throttle', () => {
  it('throttles its readable stream', async () => {
    const input = []
    for (let i = 0; i < 256; i += 1) {
      input.push('a')
    }
    const t1 = Date.now()
    await pipeline(Readable.from(input), throttle({ bps: 128 }))
    const t2 = Date.now()

    assert.strictEqual(Math.floor((t2 - t1) / 1000), 2)
  })

  it('behaves as a PassThrough stream', async () => {
    const input = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']

    /** @type {string[]} */
    const output = []

    await pipeline(
      Readable.from(input),
      throttle({ bps: 1024 }),
      new Transform({
        transform(chunk, encoding, callback) {
          output.push(chunk.toString('utf8'))
          callback(null, chunk)
        },
      }),
    )

    assert.deepStrictEqual(output.join(''), input.join(''))
  })

  it('returns a vanilla PassThrough stream if bps equals Infinity', () => {
    const stream = throttle({ bps: Infinity })

    assert.deepStrictEqual(stream.constructor, PassThrough)
  })
})
