import { describe, it, expect } from '@jest/globals'
import { MockFileError } from '../mock-file-error.js'

describe('MockFileError', () => {
  it('sets mockPath from constructor argument', () => {
    const cause = new Error('file unreadable')
    const error = new MockFileError(cause, '/responses/foo.json')

    expect(error.mockPath).toBe('/responses/foo.json')
  })

  it('sets message from cause message', () => {
    const cause = new Error('file unreadable')
    const error = new MockFileError(cause, '/responses/foo.json')

    expect(error.message).toBe('file unreadable')
  })

  it('is an instance of Error', () => {
    const error = new MockFileError(new Error('x'), '/responses/foo.json')

    expect(error instanceof Error).toBe(true)
  })

  it('has name MockFileError', () => {
    const error = new MockFileError(new Error('x'), '/responses/foo.json')

    expect(error.name).toBe('MockFileError')
  })

  it('sets cause to the original error', () => {
    const cause = new Error('original')
    const error = new MockFileError(cause, '/responses/foo.json')

    expect(error.cause).toBe(cause)
  })
})
