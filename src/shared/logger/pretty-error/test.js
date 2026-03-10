import { describe, it, expect } from '@jest/globals'
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
    expect(decoratedError.message).toMatch(/.*Error.*/g)
    expect(decoratedError.message).toMatch(
      new RegExp(`.*Expected.*${expected}`),
    )
    expect(decoratedError.message).toMatch(
      new RegExp(`.*Received.*${received}`),
    )
    expect(decoratedError.message).toContain('lorem ipsum')
    expect(decoratedError.message).toContain('dolor sit')
    expect(decoratedError.message).toContain('amet consectetur')
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
    expect(decoratedError.message).toContain('lorem ipsum')
    expect(decoratedError.message).toContain('dolor sit')
    expect(decoratedError.message).toContain('amet consectetur')
    expect(decoratedError.message).toContain('adipiscing elit')
  })
})

describe('isPrettyError', () => {
  it('returns true in case the argument is a decotated error', () => {
    const error = prettifyError({
      error: new Error('lorem ipsum'),
      expected: 'lorem',
      received: 'ipsum',
    })
    expect(isPrettyError(error)).toBe(true)
  })

  it('returns false in case the argument is not a decorated error', () => {
    const error = new Error('lorem ipsum')
    expect(isPrettyError(error)).toBe(false)
  })
})
