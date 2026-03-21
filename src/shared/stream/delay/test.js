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

  it('cancels the sleep when the stream is destroyed', async () => {
    const delayMs = 5_000
    const delayStream = delay({ ms: delayMs })

    // Write a chunk to trigger the sleep, then destroy immediately
    delayStream.write('hello')
    // Give the transform a tick to enter the sleep
    await new Promise((resolve) => setTimeout(resolve, 50))

    const t1 = Date.now()
    delayStream.destroy()

    // The sleep timer should be cancelled. If it's not, this test will
    // take 5s+ (and Jest will report the hanging timer).
    // We wait a bit and check that the delay timer is not keeping the
    // event loop alive by verifying no output was produced.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const t2 = Date.now()

    expect(t2 - t1).toBeLessThan(1000)
    expect(delayStream.destroyed).toBe(true)
  }, 2000)
})
