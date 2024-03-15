const MockedRequest = require('../mocked-request')
const { rewindable } = require('../../shared/stream')
const { getBody, SecretNotFoundError } = require('../../shared/http')
const { createMockManager } = require('./helpers/mock-manager')
const { createMockedResponse } = require('./helpers/mocked-response')
const { createMockedRequest } = require('./helpers/mocked-request')

describe('mockManager.prototype.get', () => {
  it('returns a mocked response from disk for requests', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end('Lorem Ipsum')
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    const { hasMock: hasMock1 } = await mockManager.has({ request: request1 })

    expect(hasMock1).toBe(true)

    // Test an equal request on another request object
    const request2 = rewindable(createMockedRequest())
    request2.end('Lorem Ipsum')
    const { hasMock: hasMock2 } = await mockManager.has({ request: request2 })

    expect(hasMock2).toBe(true)
  })

  it('throws an error for non-existing responses for the request passed as argument', async () => {
    expect.assertions(1)

    const mockManager = await createMockManager()
    const request = rewindable(createMockedRequest())
    request.end()

    await expect(mockManager.get({ request })).rejects.toThrow(Error)
  })

  it('doesnt return `content-length` header on mocked responses', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end()
    const response = rewindable(
      createMockedResponse({
        headers: {
          'content-length': 7,
          'content-type': 'application/json',
        },
      })
    )
    response.end('{"a":1}')
    await mockManager.set({ request: request1, response })

    const { mockedResponse } = await mockManager.get({ request: request1 })

    expect(mockedResponse.headers['content-length']).toBeUndefined()
    expect(mockedResponse.headers['content-type']).toBe('application/json')
  })

  // It should redact the header and unredact it with the value provided on `redactedHeaders`
  it('unredacts all secrets before returning a mocked response', async () => {
    expect.assertions(1)

    const mockManager = await createMockManager({
      redactedHeaders: { 'nyt-token': 1234 },
    })

    const request1 = rewindable(createMockedRequest())
    request1.end()
    const response = rewindable(
      createMockedResponse({
        headers: {
          'nyt-token': 5678,
          'content-type': 'application/json',
        },
      })
    )
    response.end('{"a":1}')
    await mockManager.set({ request: request1, response })

    const { mockedResponse } = await mockManager.get({ request: request1 })

    expect(mockedResponse.headers['nyt-token']).toBe(1234)
  })

  it('throws an error in case it cant unredact all secrets', async () => {
    expect.assertions(1)

    const mockManager = await createMockManager({
      redactedHeaders: { 'nyt-token': 1234 },
    })

    const request = rewindable(createMockedRequest())
    request.end()
    const response = rewindable(
      // Creating a response with a '[REDACTED]' headers that is not present on `redactedHeaders`
      createMockedResponse({
        headers: {
          'nyt-token': 5678,
          foo: '[REDACTED]',
          'content-type': 'application/json',
        },
      })
    )
    response.end('{"a":1}')
    await mockManager.set({ request, response })

    await expect(mockManager.get({ request })).rejects.toThrow(
      SecretNotFoundError
    )
  })
})

describe('mockManager.prototype.has', () => {
  it('takes in consideration mockKeys args', async () => {
    expect.assertions(2)

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

    expect(hasMock1).toBe(false)

    // Since it uses only `url` for key and we are using the same `url`,
    // it should return `true`
    const { hasMock: hasMock2 } = await mockManager2.has({ request: request3 })

    expect(hasMock2).toBe(true)
  })

  it('considers the same response for a request with same value on the body as defined on mockKeys', async () => {
    expect.assertions(2)

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
      })
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
      })
    )
    request2.end('{"lorem": {"ipsum": 7}}')

    // Since `mockManager1` uses `'body.lorem'` as mockKey, it should report
    // that it has a mocked response for a request with the same value on that
    // JSON path `lorem.ipsum`.
    const { hasMock: hasMock1 } = await mockManager1.has({ request: request2 })

    expect(hasMock1).toBe(true)

    // `mockeManager2` uses `'body'` as mockKey, so it only has a mocked
    // response for requests with the exact same body payload.
    const { hasMock: hasMock2 } = await mockManager2.has({ request: request2 })

    expect(hasMock2).toBe(false)
  })

  it('mockKeys.body supports N declarations', async () => {
    expect.assertions(1)

    // Creates a MockManager with `'body.lorem.ipsum'` and `'body.lorem.dolor'`
    // as mockKeys.
    const mockManager = await createMockManager({
      mockKeys: new Set(['body.lorem.ipsum', 'body.lorem.dolor']),
    })

    // Creates a request passing a JSON as body.
    const request1 = rewindable(
      createMockedRequest({
        headers: { 'content-type': 'application/json' },
      })
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
      })
    )
    request2.end('{"lorem": {"ipsum": 7, "dolor": 3}}')

    // Since `mockManager` uses `'body.lorem.ipsum'` and `'body.lorem.dolor'` as
    // mockKey, it should report that it has a mocked response for a request
    // with the same value on that JSON path `lorem.ipsum` and `lorem.dolor`.
    const { hasMock } = await mockManager.has({ request: request2 })

    expect(hasMock).toBe(true)
  })
})

describe('mockManager.prototype.clear', () => {
  it('clears all saved responses on disk', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager()

    const request1 = rewindable(createMockedRequest())
    request1.end()
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request: request1, response })

    const { hasMock: hasMock1 } = await mockManager.has({ request: request1 })

    expect(hasMock1).toBe(true)

    await mockManager.clear()

    const request2 = rewindable(
      new MockedRequest({
        url: 'http://example.com',
        method: 'GET',
      })
    )
    request2.end()

    const { hasMock: hasMock2 } = await mockManager.has({ request: request2 })

    expect(hasMock2).toBe(false)
  })
})

describe('mockManager.prototype.set', () => {
  it('saves new mock', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager()

    const request = rewindable(createMockedRequest())
    request.end()
    const response = rewindable(createMockedResponse())
    response.end()
    await mockManager.set({ request, response })

    const { hasMock, mockPath } = await mockManager.has({ request })

    expect(hasMock).toBe(true)
    expect(typeof mockPath).toBe('string')
  })

  it('doesnt save file on error', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager()

    const request = rewindable(createMockedRequest())
    request.end()
    const response = rewindable(createMockedResponse())
    response.end()

    await expect(
      mockManager.set({
        request,
        response,
        // Force an error on `set` to assert corrupted file was deleted
        fault: () => {
          throw new Error()
        },
      })
    ).rejects.toThrow(Error)

    const { hasMock: hasMock2 } = await mockManager.has({ request })

    expect(hasMock2).toBe(false)
  })

  // In case we dont have write access to the mock file while updating the
  // mocks, the original mock should not be modified nor deleted.
  it('doesnt delete file in case we dont have write access', async () => {
    expect.assertions(3)

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

    expect(hasMock1).toBe(true)

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

    await expect(
      mockManager.set({
        request: request2,
        response: response2,
        fault: () => {
          throw new CustomError({ code: 'EACCES' })
        },
      })
    ).rejects.toThrow(Error)

    const { hasMock: hasMock2 } = await mockManager.has({ request: request2 })

    expect(hasMock2).toBe(true)
  })
})

describe('mockManager.prototype.getAll', () => {
  // In case a request/response has `content-type: application/json`, mocker saves its
  // body as JSON. We need to make sure to serialize the JSON body again before
  // sending it through the stream.
  it('jSON.stringify the request and response body in case it is saved as JSON', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager()

    //
    // Create mocks
    //

    for (let i = 0; i < 2; i += 1) {
      const request = rewindable(
        createMockedRequest({
          headers: { 'content-type': 'application/json; charset=utf-8' },
        })
      )
      request.end(`{"a": { "b": {"c": 1}}}`)

      const response = rewindable(
        createMockedResponse({
          headers: { 'content-type': 'application/json; charset=utf-8' },
        })
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
      // eslint-disable-next-line jest/no-conditional-in-test
      if (mockedRequest === null || mockedResponse === null) {
        throw new Error('mockedRequest/mockedResponse shouldnt be `null`')
      }

      const requestBody = `${await getBody(mockedRequest)}`
      const responseBody = `${await getBody(mockedResponse)}`

      expect(JSON.parse(requestBody)).toStrictEqual({ a: { b: { c: 1 } } })
      expect(JSON.parse(responseBody)).toStrictEqual({
        a: 1,
        b: 2,
        c: { d: 3, e: 4 },
      })
    }
  })

  // It should redact and unredact the headers with the value provided on `redactedHeaders`
  it('unredacts all secrets on `mockedResponse` and `mockedRequest`', async () => {
    expect.assertions(2)

    const mockManager = await createMockManager({
      redactedHeaders: { 'nyt-token': 1234 },
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
            'nyt-token': i,
            'content-type': 'application/json',
          },
        })
      )
      response.end(`{"a":${i}}`)

      await mockManager.set({ request, response })
    }

    //
    // Retrieve all mocks
    //

    for await (const { mockedResponse, error } of mockManager.getAll()) {
      // eslint-disable-next-line jest/no-conditional-in-test
      if (mockedResponse === null) {
        throw new Error('mockedResponse shouldnt be `null`')
      }

      // mockedResponse nyt-token header should have the same value as passed on
      // `redactedHeaders`
      expect(mockedResponse.headers['nyt-token']).toBe(1234)
      expect(error).toBeNull()
    }
  })

  it('yields an error in case it cant unredact all secrets', async () => {
    expect.assertions(20)

    const mockManager = await createMockManager({
      redactedHeaders: { 'nyt-token': 1234 },
    })

    //
    // Create mocks
    //

    for (let i = 0; i < 5; i += 1) {
      const request = rewindable(
        createMockedRequest({
          url: `http://${i}.example.com`,
          headers: {
            'nyt-token': i,
            // Since we don't have `foo` on `redactedHeaders`, it should error
            // when it tries to unredact this secret.
            foo: '[REDACTED]',
            'content-type': 'application/json',
          },
        })
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
      expect(error).toBeInstanceOf(SecretNotFoundError)
      expect(mockedResponse).toBeNull()
      expect(mockedRequest).toBeNull()
      expect(typeof mockPath).toBe('string')
    }
  })
})
