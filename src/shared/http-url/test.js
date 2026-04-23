import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for "http://example.com"', () => {
    const result = parse('http://example.com')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('http://example.com')
    }
  })

  it('returns ok for "https://example.com/path?q=1"', () => {
    const result = parse('https://example.com/path?q=1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('https://example.com/path?q=1')
    }
  })

  it('returns ok for "http://localhost:8080"', () => {
    const result = parse('http://localhost:8080')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('http://localhost:8080')
    }
  })

  it('returns error for "/api" (relative path)', () => {
    const result = parse('/api')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "ftp://example.com" (wrong protocol)', () => {
    const result = parse('ftp://example.com')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "" (empty string)', () => {
    const result = parse('')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "not-a-url"', () => {
    const result = parse('not-a-url')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })
})
