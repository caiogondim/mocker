const { Readable, Transform } = require('stream')
const pipeline = require('../pipeline')
const createPassAndSave = require('.')

describe('passAndSave', () => {
  it('returns a promise with for accumulated buffers from stream', async () => {
    expect.assertions(1)

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
      })
    )
    const val = (await valPromise).reduce((prev, cur) => `${prev}${cur}`, '')

    expect(val).toStrictEqual(input.join(''))
  })

  it('behaves as a PassThrough stream', async () => {
    expect.assertions(1)

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
      })
    )

    expect(output.join('')).toStrictEqual(input.join(''))
  })
})
