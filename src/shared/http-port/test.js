import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for "8080"', () => {
    const result = parse('8080')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(8080)
    }
  })

  it('returns ok for "0" (port 0 is valid)', () => {
    const result = parse('0')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(0)
    }
  })

  it('returns ok for "65535" (max port)', () => {
    const result = parse('65535')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(65535)
    }
  })

  it('returns error for "-1"', () => {
    const result = parse('-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for "65536" (above max)', () => {
    const result = parse('65536')

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

  it('returns error for "3.14" (float)', () => {
    const result = parse('3.14')

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
})
