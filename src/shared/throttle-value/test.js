import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for "1024"', () => {
    const result = parse('1024')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(1024)
    }
  })

  it('returns error for "0"', () => {
    const result = parse('0')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns ok for "Infinity" with value Infinity', () => {
    const result = parse('Infinity')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(Infinity)
    }
  })

  it('returns error for "-1"', () => {
    const result = parse('-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "1.5"', () => {
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

  it('returns error for ""', () => {
    const result = parse('')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })
})
