import { describe, it, expect } from '@jest/globals'
import { PassThrough, Readable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import values from '../values/index.js'
import rewindable from './index.js'

describe('rewindable', () => {
  it('exposes a rewind method that returns a stream that can be consumed from the start', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.write('1')
    stream.write('2')
    stream.write('3')
    stream.end()
    expect(await values(stream)).toEqual(
      await values(rewindableStream.rewind()),
    )
  })

  it('can be rewinded even when stream is not finished', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.write('1')
    stream.write('2')

    const [consumedRewindableStream] = await Promise.all([
      values(rewindableStream.rewind()),
      (async () => {
        // Putting a `await sleep(0)` between `stream.write()` calls to force
        // it to be written in another chunk.
        await sleep(0)
        stream.write('3')
        await sleep(0)
        stream.write('4')
        await sleep(0)
        stream.end('5')
      })(),
    ])

    expect(consumedRewindableStream.join('')).toBe('12345')
  })

  it('rewindable stream is a proxy for the original stream', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.write('1')
    stream.write('2')
    stream.end('3')

    // Check if it's possible to consume the source stream through the proxy.
    const streamRewindableValues = await values(rewindableStream)
    expect(streamRewindableValues.toString()).toBe('123')

    // Check if it's possible to consume properties from the source object
    // through the proxy.
    expect(rewindableStream.readableEnded).toBe(true)
    expect(rewindableStream.readable).toBe(false)
    expect(typeof rewindableStream.resume).toBe('function')
  })

  it('can be called N times', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.write('1')
    stream.write('2')
    stream.end('3')

    // All calls should have the same output
    expect(`${await values(rewindableStream.rewind())}`).toBe('1,2,3')
    expect(`${await values(rewindableStream.rewind())}`).toBe('1,2,3')
    expect(`${await values(rewindableStream.rewind())}`).toBe('1,2,3')
  })

  it('works with empty streams', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.end()

    expect(`${await values(rewindableStream.rewind())}`).toBe('')
  })

  it('returns an error result in case the stream is already finished', async () => {
    const stream = new PassThrough()
    stream.end('')

    // First we consume the stream
    await values(stream)

    // Then we try to decorate the consumed stream, which should return an error result.
    const result = rewindable(stream)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe('Stream is not readable')
    }
  })

  it('can be called N times, even before the stream is not finished', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.write('1')
    stream.write('2')

    const streamsValues = await Promise.all([
      values(rewindableStream.rewind()),
      values(rewindableStream.rewind()),
      values(rewindableStream.rewind()),
      values(rewindableStream.rewind()),
      (async () => {
        stream.end('3')
      })(),
    ])

    for (let i = 0; i < 4; i += 1) {
      const streamValue = streamsValues[i]
      expect(`${streamValue}`).toBe('1,2,3')
    }
  })

  it('returns a readable stream', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    expect(rewindableStream.rewind().constructor).toEqual(Readable)
  })

  it('throws when rewind is called after release', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value

    stream.end('123')
    expect(`${await values(rewindableStream.rewind())}`).toBe('123')

    rewindableStream.release()
    expect(() => rewindableStream.rewind()).toThrow(
      'Rewindable stream was already released',
    )
  })

  it('supports Symbol.asyncDispose for await using', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error

    const rewindableStream = result.value
    stream.end('123')
    expect(`${await values(rewindableStream.rewind())}`).toBe('123')

    await rewindableStream[Symbol.asyncDispose]()

    expect(() => rewindableStream.rewind()).toThrow(
      'Rewindable stream was already released',
    )
  })

  it('supports Symbol.dispose for using', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error

    const rewindableStream = result.value
    stream.end('123')
    expect(`${await values(rewindableStream.rewind())}`).toBe('123')

    rewindableStream[Symbol.dispose]()

    expect(() => rewindableStream.rewind()).toThrow(
      'Rewindable stream was already released',
    )
  })

  it('unblocks pending rewind consumer when released', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    const rewound = rewindableStream.rewind()
    const iterator = rewound[Symbol.asyncIterator]()

    stream.write('1')
    const first = await iterator.next()
    expect(`${first.value}`).toBe('1')

    const pendingNext = iterator.next()
    await sleep(0)
    rewindableStream.release()

    await expect(pendingNext).rejects.toThrow(
      'Rewindable stream was already released',
    )
  })

  it('finishes rewound stream when source closes without end', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    const rewound = rewindableStream.rewind()
    const iterator = rewound[Symbol.asyncIterator]()

    stream.write('1')
    const first = await iterator.next()
    expect(`${first.value}`).toBe('1')

    const pendingNext = iterator.next()
    await sleep(0)
    stream.destroy()

    const next = await pendingNext
    expect(next.done).toBe(true)
  })

  // # Regression test
  //
  it('works if stream ends without a value', async () => {
    const stream = new PassThrough()
    const result = rewindable(stream)
    if (!result.ok) throw result.error
    const rewindableStream = result.value
    stream.write('1')
    stream.write('2')

    const [consumedRewindableStream] = await Promise.all([
      values(rewindableStream.rewind()),
      (async () => {
        // Putting a `await sleep(0)` between `stream.write()` calls to force
        // it to be written in another chunk.
        await sleep(0)
        stream.write('3')
        await sleep(0)
        stream.write('4')
        await sleep(0)
        stream.write('5')
        await sleep(0)
        // Calling `.end()` without a value
        stream.end()
      })(),
    ])

    expect(consumedRewindableStream.join('')).toBe('12345')
  })
})
