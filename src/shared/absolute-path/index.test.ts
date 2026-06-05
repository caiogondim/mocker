import { describe, expect, it } from 'bun:test'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for an absolute path', () => {
    const result = parse('/api/graphql')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value as string).toBe('/api/graphql')
    }
  })

  it('returns ok for the root path', () => {
    const result = parse('/')
    expect(result.ok).toBe(true)
  })

  it('returns an error for a relative path', () => {
    const result = parse('api/graphql')
    expect(result.ok).toBe(false)
  })

  it('returns an error for an empty string', () => {
    const result = parse('')
    expect(result.ok).toBe(false)
  })

  it('returns an error for an absolute URL', () => {
    const result = parse('http://example.com')
    expect(result.ok).toBe(false)
  })
})
