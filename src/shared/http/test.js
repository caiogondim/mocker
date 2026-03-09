import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import MockedRequest from '../../mock-manager/mocked-request.js'
import { isHeaders, getHeaders } from './index.js'

describe('isHeaders()', () => {
  it('returns false if input is not an object', () => {
    assert.strictEqual(isHeaders(1), false)
    assert.strictEqual(isHeaders('lorem'), false)
    assert.strictEqual(isHeaders(null), false)
    assert.strictEqual(isHeaders([1, 2, 3]), false)
    assert.strictEqual(isHeaders(() => {}), false)
  })

  it('returns false if input is an object but has an invalid shape', () => {
    assert.strictEqual(isHeaders({ foo: { bar: 2 } }), false)
    assert.strictEqual(isHeaders({ foo: () => {} }), false)
  })

  it('returns true if input has a valid shape', () => {
    assert.strictEqual(isHeaders({ host: 'example.com', 'content-length': 123 }), true)
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
    assert.notStrictEqual(clonedHeaders, headers)
    assert.deepStrictEqual(clonedHeaders, headers)
  })

  it('returns cloned headers for objects without `.headers`, but with a `.getHeaders` method', () => {
    // Given I have a request without a `.headers` property, but with a `.getHeaders` method
    const headers = { a: 1, b: 2, c: 3 }
    const request = {
      getHeaders: mock.fn(() => headers),
    }

    // When I use `getHeaders()` on it
    // @ts-ignore
    const clonedHeaders = getHeaders(request)

    // Then it should return a clone of the request's headers
    assert.notStrictEqual(clonedHeaders, headers)
    assert.deepStrictEqual(clonedHeaders, headers)
  })
})
