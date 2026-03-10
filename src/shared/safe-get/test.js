import { describe, it, expect } from '@jest/globals'
import safeGet from './index.js'

describe('safeGet', () => {
  it('doesnt throw in case a property is queried on an undefined object', () => {
    expect(safeGet({}, ['lorem', 'ipsum', 'dolor'])).toBeUndefined()
  })

  it('returns value of deep properties', () => {
    const obj = {
      lorem: {
        ipsum: {
          dolor: {
            sit: 7,
          },
        },
      },
    }
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit'])).toBe(7)
    expect(
      safeGet(obj, ['lorem', 'ipsum', 'dolor']),
    ).toBe(obj.lorem.ipsum.dolor)
  })

  it('returns undefined for not existing deep properties', () => {
    const obj = {
      lorem: {
        ipsum: {
          dolor: 'sit',
        },
      },
    }
    expect(safeGet(obj, ['quijotest'])).toBeUndefined()
    expect(safeGet(obj, ['lorem', 'quijotest'])).toBeUndefined()
    expect(
      safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit']),
    ).toBeUndefined()
    expect(
      safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit', 'amet']),
    ).toBeUndefined()
    expect(
      safeGet(obj, ['lorem', 'ipsum', 'dolor']),
    ).toBe(obj.lorem.ipsum.dolor)
  })

  it('works with arrays', () => {
    const obj = {
      lorem: {
        ipsum: {
          dolor: [1, 2, 3],
        },
      },
    }
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', '0'])).toBe(1)
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', '1'])).toBe(2)
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', '2'])).toBe(3)
  })
})
