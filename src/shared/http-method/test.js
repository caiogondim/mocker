import { describe, it, expect } from '@jest/globals'
import { parse, HTTP_METHOD } from './index.js'

describe('parse', () => {
  it('returns ok for "GET"', () => {
    const result = parse('GET')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('GET')
  })

  it('returns ok for all standard methods', () => {
    for (const method of Object.values(HTTP_METHOD)) {
      const result = parse(method)
      expect(result.ok).toBe(true)
    }
  })

  it('returns error for unknown method "PURGE"', () => {
    const result = parse('PURGE')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for empty string', () => {
    const result = parse('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for lowercase "get"', () => {
    const result = parse('get')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })
})
