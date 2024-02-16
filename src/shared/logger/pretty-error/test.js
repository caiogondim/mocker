const { prettifyError, isPrettyError } = require('./index')

describe('prettifyError()', () => {
  it('decorates error with a better message', () => {
    expect.assertions(4)

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
      new RegExp(`.*Expected.*${expected}`)
    )
    expect(decoratedError.message).toMatch(
      new RegExp(`.*Received.*${received}`)
    )
    expect(decoratedError.message).toMatchInlineSnapshot(`
      "[1mError[22m[0m: lorem ipsum
      [32mExpected[89m[0m dolor sit
      [31mReceived[89m[0m amet consectetur"
    `)
  })

  it('decorates error with a hint if provided', () => {
    expect.assertions(2)

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
    expect(decoratedError.message).toMatch(new RegExp(`.*Hint.*${hint}`))
    expect(decoratedError.message).toMatchInlineSnapshot(`
      "[1mError[22m[0m: lorem ipsum
      [32mExpected[89m[0m dolor sit
      [31mReceived[89m[0m amet consectetur
      [33mHint[89m[0m adipiscing elit"
    `)
  })
})

describe('isPrettyError', () => {
  it('returns true in case the argument is a decotated error', () => {
    expect.assertions(1)

    const error = prettifyError({
      error: new Error('lorem ipsum'),
      expected: 'lorem',
      received: 'ipsum',
    })
    expect(isPrettyError(error)).toBe(true)
  })

  it('returns false in case the argument is not a decorated error', () => {
    expect.assertions(1)

    const error = new Error('lorem ipsum')
    expect(isPrettyError(error)).toBe(false)
  })
})
