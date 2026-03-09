import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { redactHeaders, unredactHeaders, SecretNotFoundError } from './index.js'

describe('redactHeaders', () => {
  it('redact secrets from headers', () => {
    const headers = { host: ` lorem ipsum` }
    const redactedHeaders = { host: null }
    assert.deepStrictEqual(redactHeaders(headers, redactedHeaders), {
      host: `[REDACTED]`,
    })
  })

  it('does not modify the input', () => {
    const input = { host: ` lorem ipsum` }
    const inputSnapshot = JSON.stringify(input)
    const redactedHeaders = { host: null }
    const output = redactHeaders(input, redactedHeaders)
    assert.notStrictEqual(output, input)
    assert.deepStrictEqual(JSON.stringify(input), inputSnapshot)
  })

  it('is symmetrical with unredactHeaders', () => {
    // f(g(x)) === x
    const headers1 = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders1 = { 'example-token': '12341234', foo: 'ipsum' }
    assert.deepStrictEqual(
      redactHeaders(
        unredactHeaders(headers1, redactedHeaders1),
        redactedHeaders1,
      ),
      headers1,
    )

    // g(f(x)) === x
    const headers2 = {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    }
    const redactedHeaders2 = { 'example-token': '12341234' }
    assert.deepStrictEqual(
      unredactHeaders(
        redactHeaders(headers2, redactedHeaders2),
        redactedHeaders2,
      ),
      headers2,
    )
  })
})

describe('unredactHeaders', () => {
  it('throws an error in case the redacted secret is not available in the secrets map', () => {
    const headers = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders = { 'example-token': '12341234' }
    assert.throws(() => unredactHeaders(headers, redactedHeaders), (err) => {
      assert.ok(err instanceof SecretNotFoundError)
      return true
    })
  })

  it('unredacts secrets from headers', async () => {
    const headers = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders = { 'example-token': '12341234', foo: 'ipsum' }
    assert.deepStrictEqual(unredactHeaders(headers, redactedHeaders), {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    })
  })

  it('does not modify the input', () => {
    const input = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const inputSnapshot = JSON.stringify(input)
    const redactedHeaders = { 'example-token': '12341234', foo: 'ipsum' }
    const output = unredactHeaders(input, redactedHeaders)
    assert.notStrictEqual(output, input)
    assert.deepStrictEqual(JSON.stringify(input), inputSnapshot)
  })

  it('is symmetrical with redactHeaders', () => {
    // f(g(x)) === x
    const headers1 = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders1 = { 'example-token': '12341234', foo: 'ipsum' }
    assert.deepStrictEqual(
      redactHeaders(
        unredactHeaders(headers1, redactedHeaders1),
        redactedHeaders1,
      ),
      headers1,
    )

    // g(f(x)) === x
    const headers2 = {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    }
    const redactedHeaders2 = { 'example-token': '12341234' }
    assert.deepStrictEqual(
      unredactHeaders(
        redactHeaders(headers2, redactedHeaders2),
        redactedHeaders2,
      ),
      headers2,
    )
  })
})
