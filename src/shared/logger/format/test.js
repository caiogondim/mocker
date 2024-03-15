const { stringify } = require('.')

describe('stringify', () => {
  // Regression test for https://github.com/caiogondim/mocker/issues/37
  it('supports nullish types as input', () => {
    expect.assertions(2)
    expect(stringify(null)).toBe('null')
    expect(stringify(undefined)).toBe('')
  })
})
