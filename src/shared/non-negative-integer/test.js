import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for "0" (zero is valid)', () => {
    const result = parse('0')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(0)
    }
  })

  it('returns ok for "42"', () => {
    const result = parse('42')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(42)
    }
  })

  it('returns error for "-1"', () => {
    const result = parse('-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "1.5" (float)', () => {
    const result = parse('1.5')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "abc"', () => {
    const result = parse('abc')

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

  it('returns error for "Infinity"', () => {
    const result = parse('Infinity')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "undefined" (undefined coerced to string)', () => {
    const result = parse('undefined')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })
})
