import { describe, it, expect } from '@jest/globals'
import { Readable } from 'node:stream'
import values from './index.js'
import sleep from '../../sleep/index.js'

describe('values', () => {
  it('consumes the stream and return an array with all generated values', async () => {
    const readableStream = new Readable({ read() {} })
    const [readableStreamValues] = await Promise.all([
      values(readableStream),
      (async () => {
        readableStream.push('1')
        await sleep(0)
        readableStream.push('2')
        await sleep(0)
        readableStream.push('3')
        readableStream.push(null)
      })(),
    ])
    expect(readableStreamValues.map(String)).toEqual(['1', '2', '3'])
  })

  it('works with async generators', async () => {
    /**
     * @param {number} n
     * @yields {Promise<number>}
     */
    async function* numberGenerator(n) {
      let cur = 0
      while (cur < n) {
        await sleep(0)
        yield cur
        cur += 1
      }
    }

    const generatorValues = await values(numberGenerator(5))
    expect(generatorValues).toEqual([0, 1, 2, 3, 4])
  })

  it('works with sync generators', async () => {
    /**
     * @param {number} n
     * @yields {number}
     */
    function* numberGenerator(n) {
      let cur = 0
      while (cur < n) {
        yield cur
        cur += 1
      }
    }

    const generatorValues = await values(numberGenerator(5))
    expect(generatorValues).toEqual([0, 1, 2, 3, 4])
  })
})
