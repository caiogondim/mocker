const { redactHeaders, unredactHeaders, SecretNotFoundError } = require('.')

describe('redactHeaders', () => {
  it('redact secrets from headers', () => {
    expect.assertions(1)

    const headers = { host: ` lorem ipsum` }
    const redactedHeaders = { host: null }
    expect(redactHeaders(headers, redactedHeaders)).toEqual({
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
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders1 = { 'example-token': '12341234', foo: 'ipsum' }
    expect(
      redactHeaders(
        unredactHeaders(headers1, redactedHeaders1),
        redactedHeaders1
      )
    ).toEqual(headers1)

    // g(f(x)) === x
    const headers2 = {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    }
    const redactedHeaders2 = { 'example-token': '12341234' }
    expect(
      unredactHeaders(
        redactHeaders(headers2, redactedHeaders2),
        redactedHeaders2
      )
    ).toEqual(headers2)
  })
})

describe('unredactHeaders', () => {
  it('throws an error in case the redacted secret is not available in the secrets map', () => {
    expect.assertions(1)
    const headers = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders = { 'example-token': '12341234' }
    expect(() => unredactHeaders(headers, redactedHeaders)).toThrow(
      SecretNotFoundError
    )
  })

  it('unredacts secrets from headers', async () => {
    expect.assertions(1)
    const headers = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders = { 'example-token': '12341234', foo: 'ipsum' }
    expect(unredactHeaders(headers, redactedHeaders)).toEqual({
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    })
  })

  it('does not modify the input', () => {
    expect.assertions(2)
    const input = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const inputSnapshot = JSON.stringify(input)
    const redactedHeaders = { 'example-token': '12341234', foo: 'ipsum' }
    const output = unredactHeaders(input, redactedHeaders)
    expect(output).not.toBe(input)
    expect(JSON.stringify(input)).toStrictEqual(inputSnapshot)
  })

  it('is symmetrical with redactHeaders', () => {
    expect.assertions(2)

    // f(g(x)) === x
    const headers1 = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders1 = { 'example-token': '12341234', foo: 'ipsum' }
    expect(
      redactHeaders(
        unredactHeaders(headers1, redactedHeaders1),
        redactedHeaders1
      )
    ).toEqual(headers1)

    // g(f(x)) === x
    const headers2 = {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    }
    const redactedHeaders2 = { 'example-token': '12341234' }
    expect(
      unredactHeaders(
        redactHeaders(headers2, redactedHeaders2),
        redactedHeaders2
      )
    ).toEqual(headers2)
  })
})
