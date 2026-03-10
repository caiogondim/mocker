import { describe, it, expect } from '@jest/globals'
import { Readable, Transform } from 'node:stream'
import pipeline from '../pipeline/index.js'
import createPassAndSave from './index.js'

describe('passAndSave', () => {
  it('returns a promise with for accumulated buffers from stream', async () => {
    const input = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']

    /** @type {string[]} */
    const output = []

    const [passAndSave, valPromise] = createPassAndSave()

    await pipeline(
      Readable.from(input),
      passAndSave,
      new Transform({
        transform(chunk, encoding, callback) {
          output.push(chunk.toString('utf8'))
          callback(null, chunk)
        },
      }),
    )
    const val = (await valPromise).reduce((prev, cur) => `${prev}${cur}`, '')

    expect(val).toEqual(input.join(''))
  })

  it('behaves as a PassThrough stream', async () => {
    const input = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']

    /** @type {string[]} */
    const output = []

    const [passAndSave] = createPassAndSave()

    await pipeline(
      Readable.from(input),
      passAndSave,
      new Transform({
        transform(chunk, encoding, callback) {
          output.push(chunk.toString('utf8'))
          callback(null, chunk)
        },
      }),
    )

    expect(output.join('')).toEqual(input.join(''))
  })
})
