import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok with value for a valid http url', () => {
    const result = parse('http://localhost:3000/api/users')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('http://localhost:3000/api/users')
    }
  })

  it('returns ok with value for a valid https url', () => {
    const result = parse('https://example.com/path?q=1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('https://example.com/path?q=1')
    }
  })

  it('returns error for a relative path', () => {
    const result = parse('/api/users')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for a non-http protocol', () => {
    const result = parse('ftp://example.com')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for an empty string', () => {
    const result = parse('')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })
})
