/** @typedef {import('../types.js').Headers} Headers */

import { describe, it, expect } from '@jest/globals'
import { redactHeaders, unredactHeaders, SecretNotFoundError } from './index.js'

describe('redactHeaders', () => {
  it('redact secrets from headers', () => {
    const headers = { host: ` lorem ipsum` }
    const redactedHeaders = { host: null }
    expect(redactHeaders(headers, redactedHeaders)).toEqual({
      host: `[REDACTED]`,
    })
  })

  it('does not modify the input', () => {
    const input = { host: ` lorem ipsum` }
    const inputSnapshot = JSON.stringify(input)
    const redactedHeaders = { host: null }
    const output = redactHeaders(input, redactedHeaders)
    expect(output).not.toBe(input)
    expect(JSON.stringify(input)).toEqual(inputSnapshot)
  })

  it('is symmetrical with unredactHeaders', () => {
    // f(g(x)) === x
    const headers1 = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders1 = { 'example-token': '12341234', foo: 'ipsum' }
    const unredactResult1 = unredactHeaders(headers1, redactedHeaders1)
    expect(unredactResult1.ok).toBe(true)
    expect(
      redactHeaders(
        /** @type {{ ok: true; value: Headers }} */ (unredactResult1).value,
        redactedHeaders1,
      ),
    ).toEqual(headers1)

    // g(f(x)) === x
    const headers2 = {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    }
    const redactedHeaders2 = { 'example-token': '12341234' }
    const unredactResult2 = unredactHeaders(
      redactHeaders(headers2, redactedHeaders2),
      redactedHeaders2,
    )
    expect(unredactResult2.ok).toBe(true)
    expect(
      /** @type {{ ok: true; value: Headers }} */ (unredactResult2).value,
    ).toEqual(headers2)
  })
})

describe('unredactHeaders', () => {
  it('returns an error result in case the redacted secret is not available in the secrets map', () => {
    const headers = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders = { 'example-token': '12341234' }
    const result = unredactHeaders(headers, redactedHeaders)
    expect(result.ok).toBe(false)
    expect(
      /** @type {{ ok: false; error: Error }} */ (result).error,
    ).toBeInstanceOf(SecretNotFoundError)
  })

  it('unredacts secrets from headers', async () => {
    const headers = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders = { 'example-token': '12341234', foo: 'ipsum' }
    const result = unredactHeaders(headers, redactedHeaders)
    expect(result.ok).toBe(true)
    expect(/** @type {{ ok: true; value: Headers }} */ (result).value).toEqual({
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
    const result = unredactHeaders(input, redactedHeaders)
    expect(result.ok).toBe(true)
    expect(/** @type {{ ok: true; value: Headers }} */ (result).value).not.toBe(
      input,
    )
    expect(JSON.stringify(input)).toEqual(inputSnapshot)
  })

  it('is symmetrical with redactHeaders', () => {
    // f(g(x)) === x
    const headers1 = {
      'example-token': '[REDACTED]',
      foo: '[REDACTED]',
      host: 'example.com',
    }
    const redactedHeaders1 = { 'example-token': '12341234', foo: 'ipsum' }
    const unredactResult1 = unredactHeaders(headers1, redactedHeaders1)
    expect(unredactResult1.ok).toBe(true)
    expect(
      redactHeaders(
        /** @type {{ ok: true; value: Headers }} */ (unredactResult1).value,
        redactedHeaders1,
      ),
    ).toEqual(headers1)

    // g(f(x)) === x
    const headers2 = {
      'example-token': '12341234',
      foo: 'ipsum',
      host: 'example.com',
    }
    const redactedHeaders2 = { 'example-token': '12341234' }
    const unredactResult2 = unredactHeaders(
      redactHeaders(headers2, redactedHeaders2),
      redactedHeaders2,
    )
    expect(unredactResult2.ok).toBe(true)
    expect(
      /** @type {{ ok: true; value: Headers }} */ (unredactResult2).value,
    ).toEqual(headers2)
  })
})
