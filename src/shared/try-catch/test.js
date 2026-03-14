import { describe, it, expect } from '@jest/globals'
import { tryCatch, tryCatchAsync } from './index.js'

describe('tryCatch', () => {
  it('returns ok with value when function succeeds', () => {
    const result = tryCatch(() => 42)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(42)
  })

  it('returns error when function throws', () => {
    const error = new TypeError('bad input')
    const result = tryCatch(() => {
      throw error
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(error)
  })

  it('returns error for any Error subclass', () => {
    const error = new RangeError('out of range')
    const result = tryCatch(() => {
      throw error
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(error)
  })
})

describe('tryCatchAsync', () => {
  it('returns ok with value when async function resolves', async () => {
    const result = await tryCatchAsync(async () => 42)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(42)
  })

  it('returns error when async function rejects', async () => {
    const error = new TypeError('async bad input')
    const result = await tryCatchAsync(async () => {
      throw error
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(error)
  })

  it('returns error for any Error subclass', async () => {
    const error = new RangeError('out of range')
    const result = await tryCatchAsync(async () => {
      throw error
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(error)
  })
})
