import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

const ONE_HOUR_MS = 60 * 60 * 1000

describe('parse', () => {
  it('returns ok for "0"', () => {
    const result = parse('0')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(0)
  })

  it('returns ok for "1000"', () => {
    const result = parse('1000')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(1000)
  })

  it('returns ok for max value (3600000)', () => {
    const result = parse(String(ONE_HOUR_MS))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(ONE_HOUR_MS)
  })

  it('returns error for value above one hour', () => {
    const result = parse(String(ONE_HOUR_MS + 1))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for "-1"', () => {
    const result = parse('-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for "1.5" (float)', () => {
    const result = parse('1.5')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for "abc"', () => {
    const result = parse('abc')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for ""', () => {
    const result = parse('')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })
})
