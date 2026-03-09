import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stringify } from './index.js'

describe('stringify', () => {
  // Regression test for https://github.com/caiogondim/mocker/issues/37
  it('supports nullish types as input', () => {
    assert.strictEqual(stringify(null), 'null')
    assert.strictEqual(stringify(undefined), '')
  })
})
