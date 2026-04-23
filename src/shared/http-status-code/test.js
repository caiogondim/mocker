import { describe, it, expect } from '@jest/globals'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for 200', () => {
    const result = parse(200)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(200)
  })

  it('returns ok for 100 (lower boundary)', () => {
    const result = parse(100)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(100)
  })

  it('returns ok for 599 (upper boundary)', () => {
    const result = parse(599)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(599)
  })

  it('returns error for 99 (below range)', () => {
    const result = parse(99)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for 600 (above range)', () => {
    const result = parse(600)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for 200.5 (non-integer)', () => {
    const result = parse(200.5)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for NaN', () => {
    const result = parse(NaN)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })

  it('returns error for -1', () => {
    const result = parse(-1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })
})
