import { describe, expect, it } from 'bun:test'
import { stringify } from './index.js'

describe('stringify', () => {
  // Regression test for https://github.com/caiogondim/mocker/issues/37
  it('supports nullish types as input', () => {
    expect(stringify(null)).toBe('null')
    expect(stringify(undefined)).toBe('')
  })
})
