const { Readable, Transform, PassThrough } = require('stream')
const pipeline = require('../pipeline')
const delay = require('.')

describe('delay', () => {
  it('delays the start of its readable stream', async () => {
    expect.assertions(2)

    const input = ['lorem']
    const t1 = Date.now()
    await pipeline(Readable.from(input), delay({ ms: 2000 }))
    const t2 = Date.now()

    expect(t2 - t1).toBeGreaterThanOrEqual(2000)
    expect(t2 - t1).toBeLessThanOrEqual(3000)
  })

  // Regression test to prevent a delay on each chunk of a stream
  it('delays only the first chunk of a stream', async () => {
    expect.assertions(2)

    const input = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']
    const t1 = Date.now()
    await pipeline(Readable.from(input), delay({ ms: 2000 }))
    const t2 = Date.now()

    expect(t2 - t1).toBeGreaterThanOrEqual(2000)
    expect(t2 - t1).toBeLessThanOrEqual(3000)
  })

  it('behaves as a PassThrough stream', async () => {
    expect.assertions(1)

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
      })
    )

    expect(output.join('')).toStrictEqual(input.join(''))
  })

  it('returns a vanilla PassThrough stream if delay equals 0', () => {
    expect.assertions(1)

    const stream = delay({ ms: 0 })

    expect(stream.constructor).toStrictEqual(PassThrough)
  })
})
