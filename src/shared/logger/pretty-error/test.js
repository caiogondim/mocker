import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prettifyError, isPrettyError } from './index.js'

describe('prettifyError()', () => {
  it('decorates error with a better message', () => {
    const error = new Error('lorem ipsum')
    const expected = 'dolor sit'
    const received = 'amet consectetur'
    const decoratedError = prettifyError({
      error,
      expected,
      received,
    })
    assert.match(decoratedError.message, /.*Error.*/g)
    assert.match(
      decoratedError.message,
      new RegExp(`.*Expected.*${expected}`),
    )
    assert.match(
      decoratedError.message,
      new RegExp(`.*Received.*${received}`),
    )
    assert.match(decoratedError.message, /Error: lorem ipsum/)
    assert.match(decoratedError.message, /Expected dolor sit/)
    assert.match(decoratedError.message, /Received amet consectetur/)
  })

  it('decorates error with a hint if provided', () => {
    const error = new Error('lorem ipsum')
    const expected = 'dolor sit'
    const received = 'amet consectetur'
    const hint = 'adipiscing elit'
    const decoratedError = prettifyError({
      error,
      expected,
      received,
      hint,
    })
    assert.match(decoratedError.message, new RegExp(`.*Hint.*${hint}`))
    assert.match(decoratedError.message, /Error: lorem ipsum/)
    assert.match(decoratedError.message, /Expected dolor sit/)
    assert.match(decoratedError.message, /Received amet consectetur/)
    assert.match(decoratedError.message, /Hint adipiscing elit/)
  })
})

describe('isPrettyError', () => {
  it('returns true in case the argument is a decotated error', () => {
    const error = prettifyError({
      error: new Error('lorem ipsum'),
      expected: 'lorem',
      received: 'ipsum',
    })
    assert.strictEqual(isPrettyError(error), true)
  })

  it('returns false in case the argument is not a decorated error', () => {
    const error = new Error('lorem ipsum')
    assert.strictEqual(isPrettyError(error), false)
  })
})
