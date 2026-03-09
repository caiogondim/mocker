import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough, Readable } from 'node:stream'
import sleep from '../../sleep/index.js'
import values from '../values/index.js'
import rewindable from './index.js'

describe('rewindable', () => {
  it('exposes a rewind method that returns a stream that can be consumed from the start', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
    stream.write('1')
    stream.write('2')
    stream.write('3')
    stream.end()
    assert.deepStrictEqual(
      await values(stream),
      await values(rewindableStream.rewind()),
    )
  })

  it('can be rewinded even when stream is not finished', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
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

    assert.strictEqual(consumedRewindableStream.join(''), '12345')
  })

  it('rewindable stream is a proxy for the original stream', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
    stream.write('1')
    stream.write('2')
    stream.end('3')

    // Check if it's possible to consume the source stream through the proxy.
    const streamRewindableValues = await values(rewindableStream)
    assert.strictEqual(streamRewindableValues.toString(), '123')

    // Check if it's possible to consume properties from the source object
    // through the proxy.
    assert.strictEqual(rewindableStream.readableEnded, true)
    assert.strictEqual(rewindableStream.readable, false)
    assert.strictEqual(typeof rewindableStream.resume, 'function')
  })

  it('can be called N times', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
    stream.write('1')
    stream.write('2')
    stream.end('3')

    // All calls should have the same output
    assert.strictEqual(`${await values(rewindableStream.rewind())}`, '1,2,3')
    assert.strictEqual(`${await values(rewindableStream.rewind())}`, '1,2,3')
    assert.strictEqual(`${await values(rewindableStream.rewind())}`, '1,2,3')
  })

  it('works with empty streams', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
    stream.end()

    assert.strictEqual(`${await values(rewindableStream.rewind())}`, '')
  })

  it('throws an error in case the stream is already finished', async () => {
    const stream = new PassThrough()
    stream.end('')

    // First we consume the stream
    await values(stream)

    // The we try to decorate the consumed stream, which should throw an error.
    assert.throws(() => rewindable(stream), {
      message: 'Stream is not readable',
    })
  })

  it('can be called N times, even before the stream is not finished', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
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
      assert.strictEqual(`${streamValue}`, '1,2,3')
    }
  })

  it('returns a readable stream', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
    assert.deepStrictEqual(rewindableStream.rewind().constructor, Readable)
  })

  // # Regression test
  //
  it('works if stream ends without a value', async () => {
    const stream = new PassThrough()
    const rewindableStream = rewindable(stream)
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

    assert.strictEqual(consumedRewindableStream.join(''), '12345')
  })
})
