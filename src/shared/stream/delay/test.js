import { describe, it, expect } from '@jest/globals'
import { Readable, Transform, PassThrough } from 'node:stream'
import pipeline from '../pipeline/index.js'
import delay from './index.js'

describe('delay', () => {
  it('delays the start of its readable stream', async () => {
    const input = ['lorem']
    const t1 = Date.now()
    await pipeline(Readable.from(input), delay({ ms: 100 }))
    const t2 = Date.now()

    expect(t2 - t1).toBeGreaterThanOrEqual(100)
    expect(t2 - t1).toBeLessThanOrEqual(1000)
  })

  // Regression test to prevent a delay on each chunk of a stream
  it('delays only the first chunk of a stream', async () => {
    const input = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']
    const t1 = Date.now()
    await pipeline(Readable.from(input), delay({ ms: 100 }))
    const t2 = Date.now()

    expect(t2 - t1).toBeGreaterThanOrEqual(100)
    expect(t2 - t1).toBeLessThanOrEqual(1000)
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

    expect(output.join('')).toEqual(input.join(''))
  })

  it('returns a vanilla PassThrough stream if delay equals 0', () => {
    const stream = delay({ ms: 0 })

    expect(stream.constructor).toEqual(PassThrough)
  })
})
