import { describe, it, expect } from '@jest/globals'
import { Readable, Transform, PassThrough } from 'node:stream'
import pipeline from '../pipeline/index.js'
import values from '../values/index.js'
import throttle from './index.js'

describe('throttle', () => {
  it('throttles its readable stream', async () => {
    const input = []
    for (let i = 0; i < 32; i += 1) {
      input.push('a')
    }
    const t1 = Date.now()
    await pipeline(Readable.from(input), throttle({ bps: 128 }))
    const t2 = Date.now()

    expect(t2 - t1).toBeGreaterThanOrEqual(200)
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

    expect(output.join('')).toEqual(input.join(''))
  })

  it('returns a vanilla PassThrough stream if bps equals Infinity', () => {
    const stream = throttle({ bps: Infinity })

    expect(stream.constructor).toEqual(PassThrough)
  })

  it('preserves byte sequence without overlaps for low bps', async () => {
    const input = Buffer.from('abcdef')
    const output = await values(
      Readable.from([input]).pipe(throttle({ bps: 2 })),
    )
    expect(Buffer.concat(output)).toEqual(input)
  })

  it('throws for bps equal to zero', () => {
    expect(() => throttle({ bps: 0 })).toThrow(
      'bps must be a positive integer or Infinity',
    )
  })

  it('resolves pending refills when the stream is destroyed', async () => {
    // Use very low bps so the first chunk exhausts tokens and awaits refill
    const throttleStream = throttle({ bps: 1 })

    // Write a chunk larger than bps to force a refill wait
    throttleStream.write(Buffer.alloc(4, 0x42))
    // Give the transform a tick to enter the refill await
    await new Promise((resolve) => setTimeout(resolve, 50))

    const t1 = Date.now()
    throttleStream.destroy()

    // Wait a bit and verify it cleaned up quickly
    await new Promise((resolve) => setTimeout(resolve, 200))
    const t2 = Date.now()

    expect(t2 - t1).toBeLessThan(1000)
    expect(throttleStream.destroyed).toBe(true)
  }, 2000)
})
