import { describe, it, expect, jest } from '@jest/globals'
import MockedRequest from '../../mock-manager/mocked-request.js'
import { isHeaders, getHeaders } from './index.js'

describe('isHeaders()', () => {
  it('returns false if input is not an object', () => {
    expect(isHeaders(1)).toBe(false)
    expect(isHeaders('lorem')).toBe(false)
    expect(isHeaders(null)).toBe(false)
    expect(isHeaders([1, 2, 3])).toBe(false)
    expect(isHeaders(() => {})).toBe(false)
  })

  it('returns false if input is an object but has an invalid shape', () => {
    expect(isHeaders({ foo: { bar: 2 } })).toBe(false)
    expect(isHeaders({ foo: () => {} })).toBe(false)
  })

  it('returns true if input has a valid shape', () => {
    expect(isHeaders({ host: 'example.com', 'content-length': 123 })).toBe(true)
  })
})

describe('getHeaders()', () => {
  it('returns cloned headers', () => {
    // Given I have a request
    const headers = { a: 1, b: 2, c: 3 }
    const mockedRequest = new MockedRequest({
      url: 'http://example.com/example',
      headers,
    })

    // When I use `getHeaders()` on it
    const clonedHeaders = getHeaders(mockedRequest)

    // Then it should return a clone of the request's headers
    expect(clonedHeaders).not.toBe(headers)
    expect(clonedHeaders).toEqual(headers)
  })

  it('returns cloned headers for objects without `.headers`, but with a `.getHeaders` method', () => {
    // Given I have a request without a `.headers` property, but with a `.getHeaders` method
    const headers = { a: 1, b: 2, c: 3 }
    const request = {
      getHeaders: jest.fn(() => headers),
    }

    // When I use `getHeaders()` on it
    // @ts-expect-error — intentionally passing a minimal object to test duck-typing fallback
    const clonedHeaders = getHeaders(request)

    // Then it should return a clone of the request's headers
    expect(clonedHeaders).not.toBe(headers)
    expect(clonedHeaders).toEqual(headers)
  })
})
