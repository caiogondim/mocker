import { describe, it, expect } from '@jest/globals'
import path from 'node:path'
import { parse } from './index.js'

describe('parse', () => {
  it('returns ok for an existing directory', async () => {
    const result = await parse('src/')

    expect(result.ok).toBe(true)
  })

  it('returns ok and value is the resolved absolute path', async () => {
    const result = await parse('src/')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(path.resolve('src/'))
    }
  })

  it('returns error for a non-existing directory', async () => {
    const result = await parse('non-existing-folder-xyz')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for a file path (not a directory)', async () => {
    const result = await parse('package.json')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })

  it('returns error for an empty string', async () => {
    const result = await parse('')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError)
    }
  })
})
