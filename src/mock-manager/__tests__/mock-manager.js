import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import MockedRequest from '../mocked-request.js'
import { rewindable } from '../../shared/stream/index.js'
import { getBody, SecretNotFoundError } from '../../shared/http/index.js'
import { createMockManager } from './helpers/mock-manager.js'
import { createMockedResponse } from './helpers/mocked-response.js'
import { createMockedRequest } from './helpers/mocked-request.js'

describe('mock-manager', { concurrency: 1 }, () => {
describe('mockManager.get', () => {
  it('returns a mocked response from disk for requests', async () => {
    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end('Lorem Ipsum')
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    const { hasMock: hasMock1 } = await mockManager.has({ request: request1 })

    assert.strictEqual(hasMock1, true)

    // Test an equal request on another request object
    const request2 = rewindable(createMockedRequest())
    request2.end('Lorem Ipsum')
    const { hasMock: hasMock2 } = await mockManager.has({ request: request2 })

    assert.strictEqual(hasMock2, true)
  })

  it('throws an error for non-existing responses for the request passed as argument', async () => {
    const mockManager = await createMockManager()
    const request = rewindable(createMockedRequest())
    request.end()

    await assert.rejects(mockManager.get({ request }), Error)
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

    const { mockedResponse } = await mockManager.get({ request: request1 })

    assert.strictEqual(mockedResponse.headers['content-length'], undefined)
    assert.strictEqual(mockedResponse.headers['content-type'], 'application/json')
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

    const { mockedResponse } = await mockManager.get({ request: request1 })

    assert.strictEqual(mockedResponse.headers['example-token'], 1234)
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

    await assert.rejects(mockManager.get({ request }), (err) => {
      assert.ok(err instanceof SecretNotFoundError)
      return true
    })
  })
})

describe('mockManager.has', () => {
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
    const { hasMock: hasMock1 } = await mockManager1.has({ request: request3 })

    assert.strictEqual(hasMock1, false)

    // Since it uses only `url` for key and we are using the same `url`,
    // it should return `true`
    const { hasMock: hasMock2 } = await mockManager2.has({ request: request3 })

    assert.strictEqual(hasMock2, true)
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
    const { hasMock: hasMock1 } = await mockManager1.has({ request: request2 })

    assert.strictEqual(hasMock1, true)

    // `mockeManager2` uses `'body'` as mockKey, so it only has a mocked
    // response for requests with the exact same body payload.
    const { hasMock: hasMock2 } = await mockManager2.has({ request: request2 })

    assert.strictEqual(hasMock2, false)
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
    const { hasMock } = await mockManager.has({ request: request2 })

    assert.strictEqual(hasMock, true)
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

    const { hasMock: hasMock1 } = await mockManager.has({ request: request1 })

    assert.strictEqual(hasMock1, true)

    await mockManager.clear()

    const request2 = rewindable(
      new MockedRequest({
        url: 'http://example.com',
        method: 'GET',
      }),
    )
    request2.end()

    const { hasMock: hasMock2 } = await mockManager.has({ request: request2 })

    assert.strictEqual(hasMock2, false)
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

    const { hasMock, mockPath } = await mockManager.has({ request })

    assert.strictEqual(hasMock, true)
    assert.strictEqual(typeof mockPath, 'string')
  })

  it('doesnt save file on error', async () => {
    const mockManager = await createMockManager()

    const request = rewindable(createMockedRequest())
    request.end()
    const response = rewindable(createMockedResponse())
    response.end()

    await assert.rejects(
      mockManager.set({
        request,
        response,
        // Force an error on `set` to assert corrupted file was deleted
        fault: () => {
          throw new Error()
        },
      }),
      Error,
    )

    const { hasMock: hasMock2 } = await mockManager.has({ request })

    assert.strictEqual(hasMock2, false)
  })

  // In case we dont have write access to the mock file while updating the
  // mocks, the original mock should not be modified nor deleted.
  it('doesnt delete file in case we dont have write access', async () => {
    const mockManager = await createMockManager()

    //
    // Save a mock
    //

    const response1 = rewindable(createMockedResponse())
    response1.end()
    const request1 = rewindable(createMockedRequest())
    request1.end()
    await mockManager.set({
      request: request1,
      response: response1,
    })

    const { hasMock: hasMock1 } = await mockManager.has({ request: request1 })

    assert.strictEqual(hasMock1, true)

    //
    // Force a "no write access" error on `set` while updating existing mock
    //

    const response2 = rewindable(createMockedResponse())
    response2.end()
    const request2 = rewindable(createMockedRequest())
    request2.end()

    class CustomError extends Error {
      constructor({ code = '' }) {
        super()
        this.code = code
      }
    }

    await assert.rejects(
      mockManager.set({
        request: request2,
        response: response2,
        fault: () => {
          throw new CustomError({ code: 'EACCES' })
        },
      }),
      Error,
    )

    const { hasMock: hasMock2 } = await mockManager.has({ request: request2 })

    assert.strictEqual(hasMock2, true)
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

    for await (const {
      mockedRequest,
      mockedResponse,
    } of mockManager.getAll()) {
      if (mockedRequest === null || mockedResponse === null) {
        throw new Error('mockedRequest/mockedResponse shouldnt be `null`')
      }

      const requestBody = `${await getBody(mockedRequest)}`
      const responseBody = `${await getBody(mockedResponse)}`

      assert.deepStrictEqual(JSON.parse(requestBody), { a: { b: { c: 1 } } })
      assert.deepStrictEqual(JSON.parse(responseBody), {
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

    for await (const { mockedResponse, error } of mockManager.getAll()) {
      if (mockedResponse === null) {
        throw new Error('mockedResponse shouldnt be `null`')
      }

      // mockedResponse example-token header should have the same value as passed on
      // `redactedHeaders`
      assert.strictEqual(mockedResponse.headers['example-token'], 1234)
      assert.strictEqual(error, null)
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

    for await (const {
      error,
      mockedResponse,
      mockedRequest,
      mockPath,
    } of mockManager.getAll()) {
      assert.ok(error instanceof SecretNotFoundError)
      assert.strictEqual(mockedResponse, null)
      assert.strictEqual(mockedRequest, null)
      assert.strictEqual(typeof mockPath, 'string')
    }
  })
})
})
