import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import stringToBoolean from './index.js'

describe('stringToBoolean', () => {
  it('returns true for strings with truthy meaning', () => {
    assert.strictEqual(stringToBoolean('1'), true)
    assert.strictEqual(stringToBoolean('true'), true)
    assert.strictEqual(stringToBoolean('yes'), true)
    assert.strictEqual(stringToBoolean('y'), true)
  })

  it('returns false for string that doesnt contain a truthy meaning', () => {
    assert.strictEqual(stringToBoolean('0'), false)
    assert.strictEqual(stringToBoolean('2'), false)
    assert.strictEqual(stringToBoolean('false'), false)
    assert.strictEqual(stringToBoolean('no'), false)
    assert.strictEqual(stringToBoolean('n'), false)
    assert.strictEqual(stringToBoolean('lorem'), false)
  })
})
