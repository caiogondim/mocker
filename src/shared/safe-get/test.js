import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import safeGet from './index.js'

describe('safeGet', () => {
  it('doesnt throw in case a property is queried on an undefined object', () => {
    assert.strictEqual(safeGet({}, ['lorem', 'ipsum', 'dolor']), undefined)
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
    assert.strictEqual(safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit']), 7)
    assert.strictEqual(
      safeGet(obj, ['lorem', 'ipsum', 'dolor']),
      obj.lorem.ipsum.dolor,
    )
  })

  it('returns undefined for not existing deep properties', () => {
    const obj = {
      lorem: {
        ipsum: {
          dolor: 'sit',
        },
      },
    }
    assert.strictEqual(safeGet(obj, ['quijotest']), undefined)
    assert.strictEqual(safeGet(obj, ['lorem', 'quijotest']), undefined)
    assert.strictEqual(
      safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit']),
      undefined,
    )
    assert.strictEqual(
      safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit', 'amet']),
      undefined,
    )
    assert.strictEqual(
      safeGet(obj, ['lorem', 'ipsum', 'dolor']),
      obj.lorem.ipsum.dolor,
    )
  })

  it('works with arrays', () => {
    const obj = {
      lorem: {
        ipsum: {
          dolor: [1, 2, 3],
        },
      },
    }
    assert.strictEqual(safeGet(obj, ['lorem', 'ipsum', 'dolor', '0']), 1)
    assert.strictEqual(safeGet(obj, ['lorem', 'ipsum', 'dolor', '1']), 2)
    assert.strictEqual(safeGet(obj, ['lorem', 'ipsum', 'dolor', '2']), 3)
  })
})
