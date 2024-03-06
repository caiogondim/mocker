const { redactHeaders, unredactHeaders, SecretNotFoundError } = require('.')

describe('redactHeaders', () => {
  it('redact secrets from headers', () => {
    expect.assertions(1)

    const headers = { host: ` lorem ipsum` }
    const redactedHeaders = { host: null }
    expect(redactHeaders(headers, redactedHeaders)).toStrictEqual({
      host: `[REDACTED]`,
    })
  })

  it('does not modify the input', () => {
    expect.assertions(2)

    const input = { host: ` lorem ipsum` }
    const inputSnapshot = JSON.stringify(input)
    const redactedHeaders = { host: null }
    const output = redactHeaders(input, redactedHeaders)
    expect(output).not.toBe(input)
    expect(JSON.stringify(input)).toStrictEqual(inputSnapshot)
  })

  it('is symmetrical with unredactHeaders', () => {
    expect.assertions(2)

    // f(g(x)) === x
    const headers1 = {
      'nyt-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'nytimes.com',
    }
    const redactedHeaders1 = { 'nyt-token': '12341234', foo: 'ipsum' }
    expect(
      redactHeaders(
        unredactHeaders(headers1, redactedHeaders1),
        redactedHeaders1
      )
    ).toStrictEqual(headers1)

    // g(f(x)) === x
    const headers2 = {
      'nyt-token': '12341234',
      foo: 'ipsum',
      host: 'nytimes.com',
    }
    const redactedHeaders2 = { 'nyt-token': '12341234' }
    expect(
      unredactHeaders(
        redactHeaders(headers2, redactedHeaders2),
        redactedHeaders2
      )
    ).toStrictEqual(headers2)
  })
})

describe('unredactHeaders', () => {
  it('throws an error in case the redacted secret is not available in the secrets map', () => {
    expect.assertions(1)
    const headers = {
      'nyt-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'nytimes.com',
    }
    const redactedHeaders = { 'nyt-token': '12341234' }
    expect(() => unredactHeaders(headers, redactedHeaders)).toThrow(
      SecretNotFoundError
    )
  })

  it('unredacts secrets from headers', async () => {
    expect.assertions(1)
    const headers = {
      'nyt-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'nytimes.com',
    }
    const redactedHeaders = { 'nyt-token': '12341234', foo: 'ipsum' }
    expect(unredactHeaders(headers, redactedHeaders)).toStrictEqual({
      'nyt-token': '12341234',
      foo: 'ipsum',
      host: 'nytimes.com',
    })
  })

  it('does not modify the input', () => {
    expect.assertions(2)
    const input = {
      'nyt-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'nytimes.com',
    }
    const inputSnapshot = JSON.stringify(input)
    const redactedHeaders = { 'nyt-token': '12341234', foo: 'ipsum' }
    const output = unredactHeaders(input, redactedHeaders)
    expect(output).not.toBe(input)
    expect(JSON.stringify(input)).toStrictEqual(inputSnapshot)
  })

  it('is symmetrical with redactHeaders', () => {
    expect.assertions(2)

    // f(g(x)) === x
    const headers1 = {
      'nyt-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'nytimes.com',
    }
    const redactedHeaders1 = { 'nyt-token': '12341234', foo: 'ipsum' }
    expect(
      redactHeaders(
        unredactHeaders(headers1, redactedHeaders1),
        redactedHeaders1
      )
    ).toStrictEqual(headers1)

    // g(f(x)) === x
    const headers2 = {
      'nyt-token': '12341234',
      foo: 'ipsum',
      host: 'nytimes.com',
    }
    const redactedHeaders2 = { 'nyt-token': '12341234' }
    expect(
      unredactHeaders(
        redactHeaders(headers2, redactedHeaders2),
        redactedHeaders2
      )
    ).toStrictEqual(headers2)
  })
})