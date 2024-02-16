const { Readable, Transform, PassThrough } = require('stream')
const pipeline = require('../pipeline')
const throttle = require('.')

describe('throttle', () => {
  it('throttles its readable stream', async () => {
    expect.assertions(1)

    const input = []
    for (let i = 0; i < 256; i += 1) {
      input.push('a')
    }
    const t1 = Date.now()
    await pipeline(Readable.from(input), throttle({ bps: 128 }))
    const t2 = Date.now()

    expect(Math.floor((t2 - t1) / 1000)).toStrictEqual(2)
  })

  it('behaves as a PassThrough stream', async () => {
    expect.assertions(1)

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
      })
    )

    expect(output.join('')).toStrictEqual(input.join(''))
  })

  it('returns a vanilla PassThrough stream if bps equals Infinity', () => {
    expect.assertions(1)

    const stream = throttle({ bps: Infinity })

    expect(stream.constructor).toStrictEqual(PassThrough)
  })
})
