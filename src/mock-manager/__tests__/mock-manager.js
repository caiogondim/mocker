import { describe, it, expect } from '@jest/globals'
import MockedRequest from '../mocked-request.js'
import { rewindable as rewindableRaw } from '../../shared/stream/index.js'
import { getBody, SecretNotFoundError } from '../../shared/http/index.js'
import { createMockManager } from './helpers/mock-manager.js'
import { createMockedResponse } from './helpers/mocked-response.js'
import { createMockedRequest } from './helpers/mocked-request.js'
import { MockFileError } from '../mock-file-error.js'
import { MockGetError } from '../index.js'

/** @template T @param {any} stream @returns {T} */
function rewindable(/** @type {any} */ stream) {
  const result = rewindableRaw(stream)
  if (!result.ok) throw result.error
  return result.value
}

describe('mockManager.get', () => {
  it('returns a mocked response from disk for requests', async () => {
    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end('Lorem Ipsum')
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    const getResult1 = await mockManager.get({ request: request1 })

    expect(getResult1.ok).toBe(true)

    // Test an equal request on another request object
    const request2 = rewindable(createMockedRequest())
    request2.end('Lorem Ipsum')
    const getResult2 = await mockManager.get({ request: request2 })

    expect(getResult2.ok).toBe(true)
  })

  it('throws an error for non-existing responses for the request passed as argument', async () => {
    const mockManager = await createMockManager()
    const request = rewindable(createMockedRequest())
    request.end()

    const getResult = await mockManager.get({ request })
    expect(getResult.ok).toBe(false)
  })

  it('doesnt return `content-length` header on mocked responses', async () => {
    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end()
    const response = rewindable(
      createMockedResponse({
        headers: {
          'content-length': 7,
          'content-type': 'application/json',
        },
      }),
    )
    response.end('{"a":1}')
    await mockManager.set({ request: request1, response })

    const getResult = await mockManager.get({ request: request1 })
    if (!getResult.ok) throw getResult.error
    const { mockedResponse } = getResult.value

    expect(mockedResponse.headers['content-length']).toBeUndefined()
    expect(mockedResponse.headers['content-type']).toBe('application/json')
  })

  // It should redact the header and unredact it with the value provided on `redactedHeaders`
  it('unredacts all secrets before returning a mocked response', async () => {
    const mockManager = await createMockManager({
      redactedHeaders: { 'example-token': 1234 },
    })

    const request1 = rewindable(createMockedRequest())
    request1.end()
    const response = rewindable(
      createMockedResponse({
        headers: {
          'example-token': 5678,
          'content-type': 'application/json',
        },
      }),
    )
    response.end('{"a":1}')
    await mockManager.set({ request: request1, response })

    const getResult = await mockManager.get({ request: request1 })
    if (!getResult.ok) throw getResult.error
    const { mockedResponse } = getResult.value

    expect(mockedResponse.headers['example-token']).toBe(1234)
  })

  it('throws an error in case it cant unredact all secrets', async () => {
    const mockManager = await createMockManager({
      redactedHeaders: { 'example-token': 1234 },
    })

    const request = rewindable(createMockedRequest())
    request.end()
    const response = rewindable(
      // Creating a response with a '[REDACTED]' headers that is not present on `redactedHeaders`
      createMockedResponse({
        headers: {
          'example-token': 5678,
          foo: '[REDACTED]',
          'content-type': 'application/json',
        },
      }),
    )
    response.end('{"a":1}')
    await mockManager.set({ request, response })

    const getResult = await mockManager.get({ request })
    expect(getResult.ok).toBe(false)
    if (!getResult.ok) {
      expect(getResult.error).toBeInstanceOf(MockGetError)
      expect(getResult.error.cause).toBeInstanceOf(SecretNotFoundError)
    }
  })
})

describe('mockManager.get with mockKeys', () => {
  it('takes in consideration mockKeys args', async () => {
    // Uses `url` and `method` to create a key for the request.
    const mockManager1 = await createMockManager({
      mockKeys: new Set(['url', 'method']),
    })

    // Uses only `url` to create a key for the request.
    const mockManager2 = await createMockManager({
      mockKeys: new Set(['url']),
    })

    // Creates a GET request
    const request1 = rewindable(createMockedRequest({ method: 'GET' }))
    request1.end()

    // Creates a POST request for same URL
    const request2 = rewindable(createMockedRequest({ method: 'POST' }))
    request2.end()

    const response1 = rewindable(createMockedResponse())
    response1.end()

    await mockManager1.set({ request: request1, response: response1 })
    await mockManager2.set({ request: request2, response: response1 })

    // Creates another request for the same URL but with a different HTTP method
    const request3 = rewindable(createMockedRequest({ method: 'PATCH' }))
    request3.end()

    // Since it does use `method` for key and we are using a new method,
    // it should return `false`
    const getResult1 = await mockManager1.get({ request: request3 })

    expect(getResult1.ok).toBe(false)

    // Since it uses only `url` for key and we are using the same `url`,
    // it should return `true`
    const getResult2 = await mockManager2.get({ request: request3 })

    expect(getResult2.ok).toBe(true)
  })

  it('considers the same response for a request with same value on the body as defined on mockKeys', async () => {
    // Creates a MockManager with `'body.lorem.ipsum'` as mockKeys.
    const mockManager1 = await createMockManager({
      mockKeys: new Set(['body.lorem.ipsum']),
    })

    // Creates another MockManager, now with `'body'` as mockKeys.
    const mockManager2 = await createMockManager({
      mockKeys: new Set(['body']),
    })

    // Creates a request passing a JSON as body.
    const request1 = rewindable(
      createMockedRequest({
        headers: { 'content-type': 'application/json' },
      }),
    )
    request1.end('{"lorem": {"ipsum": 7}, "dolor": 3}')

    // Creates a vanilla response for the previous response.
    const response1 = rewindable(createMockedResponse())
    response1.end()

    await mockManager1.set({ request: request1, response: response1 })
    await mockManager2.set({ request: request1, response: response1 })

    // Creates another MockedRequest with a JSON body similar to the previous
    // one, but with a missing key on the JSON body.
    const request2 = rewindable(
      createMockedRequest({
        headers: { 'content-type': 'application/json' },
      }),
    )
    request2.end('{"lorem": {"ipsum": 7}}')

    // Since `mockManager1` uses `'body.lorem'` as mockKey, it should report
    // that it has a mocked response for a request with the same value on that
    // JSON path `lorem.ipsum`.
    const getResult1 = await mockManager1.get({ request: request2 })

    expect(getResult1.ok).toBe(true)

    // `mockeManager2` uses `'body'` as mockKey, so it only has a mocked
    // response for requests with the exact same body payload.
    const getResult2 = await mockManager2.get({ request: request2 })

    expect(getResult2.ok).toBe(false)
  })

  it('mockKeys.body supports N declarations', async () => {
    // Creates a MockManager with `'body.lorem.ipsum'` and `'body.lorem.dolor'`
    // as mockKeys.
    const mockManager = await createMockManager({
      mockKeys: new Set(['body.lorem.ipsum', 'body.lorem.dolor']),
    })

    // Creates a request passing a JSON as body.
    const request1 = rewindable(
      createMockedRequest({
        headers: { 'content-type': 'application/json' },
      }),
    )
    request1.end('{"lorem": {"ipsum": 7, "dolor": 3, "amet": 4}}')

    // Creates a vanilla response for the previous request.
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    // Creates another MockedRequest with a JSON body similar to the previous
    // one, but with a missing key on the JSON body.
    const request2 = rewindable(
      createMockedRequest({
        headers: { 'content-type': 'application/json' },
      }),
    )
    request2.end('{"lorem": {"ipsum": 7, "dolor": 3}}')

    // Since `mockManager` uses `'body.lorem.ipsum'` and `'body.lorem.dolor'` as
    // mockKey, it should report that it has a mocked response for a request
    // with the same value on that JSON path `lorem.ipsum` and `lorem.dolor`.
    const getResult = await mockManager.get({ request: request2 })

    expect(getResult.ok).toBe(true)
  })
})

describe('mockManager.clear', () => {
  it('clears all saved responses on disk', async () => {
    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end()
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    const getResult1 = await mockManager.get({ request: request1 })

    expect(getResult1.ok).toBe(true)

    await mockManager.clear()

    const request2 = rewindable(
      new MockedRequest({
        url: 'http://example.com',
        method: 'GET',
      }),
    )
    request2.end()

    const getResult2 = await mockManager.get({ request: request2 })

    expect(getResult2.ok).toBe(false)
  })
})

describe('mockManager.set', () => {
  it('saves new mock', async () => {
    const mockManager = await createMockManager()

    const request = rewindable(createMockedRequest())
    request.end()
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request, response })

    const getResult = await mockManager.get({ request })

    expect(getResult.ok).toBe(true)
    if (getResult.ok) {
      expect(typeof getResult.value.mockPath).toBe('string')
    }
  })

})

describe('mock filenames', () => {
  it('uses human-readable GraphQL filename for query requests', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method', 'body']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/graphql',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(
      JSON.stringify({
        operationName: 'MerchantEnrollmentReport',
        query: 'query MerchantEnrollmentReport { merchant { id } }',
      }),
    )

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult1 = await mockManager.set({ request, response })
    if (!setResult1.ok) throw setResult1.error
    const { mockPath } = setResult1.value

    expect(mockPath).toMatch(
      /[a-f0-9]+-gql-query-merchant-enrollment-report\.json$/,
    )
  })

  it('uses human-readable GraphQL filename for mutation requests', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method', 'body']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/graphql',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(
      JSON.stringify({
        operationName: 'UpdateUser',
        query: 'mutation UpdateUser($id: ID!) { updateUser(id: $id) { id } }',
      }),
    )

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult2 = await mockManager.set({ request, response })
    if (!setResult2.ok) throw setResult2.error
    const { mockPath } = setResult2.value

    expect(mockPath).toMatch(/[a-f0-9]+-gql-mutation-update-user\.json$/)
  })

  it('falls back to hash-based HTTP filename when no operationName', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/api/users',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(JSON.stringify({ foo: 'bar' }))

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult3 = await mockManager.set({ request, response })
    if (!setResult3.ok) throw setResult3.error
    const { mockPath } = setResult3.value

    expect(mockPath).toMatch(/[a-f0-9]+-http-post-api-users\.json$/)
  })

  it('falls back to hash-based HTTP filename when operationName present but no query', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method', 'body']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/graphql',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(JSON.stringify({ operationName: 'GetUser' }))

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult4 = await mockManager.set({ request, response })
    if (!setResult4.ok) throw setResult4.error
    const { mockPath } = setResult4.value

    expect(mockPath).toMatch(/[a-f0-9]+-http-post-graphql\.json$/)
  })

  it('uses human-readable HTTP filename with method and path', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'GET',
        url: 'http://example.com/api/merchants/reports',
      }),
    )
    request.end()

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult5 = await mockManager.set({ request, response })
    if (!setResult5.ok) throw setResult5.error
    const { mockPath } = setResult5.value

    expect(mockPath).toMatch(/[a-f0-9]+-http-get-api-merchants-reports\.json$/)
  })

  it('sanitizes HTTP filename for relative URLs with query params', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: '/api/federated-gateway-protected/graphql?opname=typename',
      }),
    )
    request.end()

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult6 = await mockManager.set({ request, response })
    if (!setResult6.ok) throw setResult6.error
    const { mockPath } = setResult6.value

    expect(mockPath).toMatch(
      /[a-f0-9]+-http-post-api-federated-gateway-protected-graphql\.json$/,
    )
  })

  it('sanitizes GraphQL operation names to lowercase letters, numbers, and dashes', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method', 'body']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/graphql',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(
      JSON.stringify({
        operationName: 'Get$Merchant#Info/V2',
        query: 'query Get$Merchant#Info/V2 { merchant { id } }',
      }),
    )

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult7 = await mockManager.set({ request, response })
    if (!setResult7.ok) throw setResult7.error
    const { mockPath } = setResult7.value

    expect(mockPath).toMatch(/[a-f0-9]+-gql-query-get-merchant-info-v2\.json$/)
  })

  it('uses gql-operation when query type cannot be determined', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method', 'body']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/graphql',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(
      JSON.stringify({
        operationName: 'GetUser',
        query: '{ user { id name } }',
      }),
    )

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult8 = await mockManager.set({ request, response })
    if (!setResult8.ok) throw setResult8.error
    const { mockPath } = setResult8.value

    expect(mockPath).toMatch(/[a-f0-9]+-gql-operation-get-user\.json$/)
  })

  it('truncates filename to 80 characters', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'GET',
        url: 'http://example.com/api/very/long/path/that/goes/on/and/on/and/keeps/going/forever/until/it/exceeds/the/limit',
      }),
    )
    request.end()

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult9 = await mockManager.set({ request, response })
    if (!setResult9.ok) throw setResult9.error
    const { mockPath } = setResult9.value

    const fileName = /** @type {string} */ (mockPath.split('/').pop())
    expect(fileName).toMatchInlineSnapshot(
      `"bb63f5540dcf-http-get-api-very-long-path-that-goes-on-and-on-and-keeps-goin.json"`,
    )
    expect(fileName.length).toEqual(80)
  })

  it('still resolves to the same mock file after truncation', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method']),
    })

    const longUrl =
      'http://example.com/api/very/long/path/that/goes/on/and/on/and/keeps/going/forever/until/it/exceeds/the/limit'

    const request1 = rewindable(
      createMockedRequest({ method: 'GET', url: longUrl }),
    )
    request1.end()
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    const request2 = rewindable(
      createMockedRequest({ method: 'GET', url: longUrl }),
    )
    request2.end()
    const getResult = await mockManager.get({ request: request2 })

    expect(getResult.ok).toBe(true)
  })

  it('converts SCREAMING_SNAKE_CASE operation names to kebab-case', async () => {
    const mockManager = await createMockManager({
      mockKeys: new Set(['url', 'method', 'body']),
    })

    const request = rewindable(
      createMockedRequest({
        method: 'POST',
        url: 'http://example.com/graphql',
        headers: { 'content-type': 'application/json' },
      }),
    )
    request.end(
      JSON.stringify({
        operationName: 'MERCHANT_ENROLLMENT_REPORT',
        query: 'query MERCHANT_ENROLLMENT_REPORT { merchant { id } }',
      }),
    )

    const response = rewindable(createMockedResponse())
    response.end()
    const setResult10 = await mockManager.set({ request, response })
    if (!setResult10.ok) throw setResult10.error
    const { mockPath } = setResult10.value

    expect(mockPath).toMatch(
      /[a-f0-9]+-gql-query-merchant-enrollment-report\.json$/,
    )
  })
})

describe('mockManager.getAll', () => {
  // In case a request/response has `content-type: application/json`, mocker saves its
  // body as JSON. We need to make sure to serialize the JSON body again before
  // sending it through the stream.
  it('jSON.stringify the request and response body in case it is saved as JSON', async () => {
    const mockManager = await createMockManager()

    //
    // Create mocks
    //

    for (let i = 0; i < 2; i += 1) {
      const request = rewindable(
        createMockedRequest({
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      )
      request.end(`{"a": { "b": {"c": 1}}}`)

      const response = rewindable(
        createMockedResponse({
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      )
      response.end(`{"a":1, "b": 2, "c": { "d": 3, "e": 4 }}`)

      await mockManager.set({ request, response })
    }

    //
    // Retrieve all mocks
    //

    for await (const item of mockManager.getAll()) {
      if (!item.ok) throw item.error

      const { mockedRequest, mockedResponse } = item.value
      const requestBody = `${await getBody(mockedRequest)}`
      const responseBody = `${await getBody(mockedResponse)}`

      expect(JSON.parse(requestBody)).toEqual({ a: { b: { c: 1 } } })
      expect(JSON.parse(responseBody)).toEqual({
        a: 1,
        b: 2,
        c: { d: 3, e: 4 },
      })
    }
  })

  // It should redact and unredact the headers with the value provided on `redactedHeaders`
  it('unredacts all secrets on `mockedResponse` and `mockedRequest`', async () => {
    const mockManager = await createMockManager({
      redactedHeaders: { 'example-token': 1234 },
    })

    //
    // Create mocks
    //

    for (let i = 0; i < 2; i += 1) {
      const request = rewindable(createMockedRequest())
      request.end()

      const response = rewindable(
        createMockedResponse({
          headers: {
            'example-token': i,
            'content-type': 'application/json',
          },
        }),
      )
      response.end(`{"a":${i}}`)

      await mockManager.set({ request, response })
    }

    //
    // Retrieve all mocks
    //

    for await (const item of mockManager.getAll()) {
      if (!item.ok) throw item.error

      // mockedResponse example-token header should have the same value as passed on
      // `redactedHeaders`
      expect(item.value.mockedResponse.headers['example-token']).toBe(1234)
    }
  })

  it('yields an error in case it cant unredact all secrets', async () => {
    const mockManager = await createMockManager({
      redactedHeaders: { 'example-token': 1234 },
    })

    //
    // Create mocks
    //

    for (let i = 0; i < 5; i += 1) {
      const request = rewindable(
        createMockedRequest({
          url: `http://${i}.example.com`,
          headers: {
            'example-token': i,
            // Since we don't have `foo` on `redactedHeaders`, it should error
            // when it tries to unredact this secret.
            foo: '[REDACTED]',
            'content-type': 'application/json',
          },
        }),
      )
      request.end()
      const response = rewindable(createMockedResponse())
      response.end(`{"a":${i}}`)
      await mockManager.set({ request, response })
    }

    //
    // Retrieve all mocks
    //

    for await (const item of mockManager.getAll()) {
      expect(item.ok).toBe(false)
      if (!item.ok) {
        expect(item.error).toBeInstanceOf(MockFileError)
        expect(typeof item.error.mockPath).toBe('string')
      }
    }
  })
})
