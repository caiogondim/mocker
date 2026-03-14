import { describe, it, expect, jest } from '@jest/globals'
import { createServer as createDuplicateRequestServer } from '../../../../tools/duplicate-request-server/index.js'
import { createServer as createFlakyServer } from '../../../../tools/flaky-server/index.js'
import { createServer as createStatusCodeServer } from '../../../../tools/status-code-server/index.js'
import createBackoff from '../../backoff/index.js'
import { setTimeout as sleep } from 'node:timers/promises'
import { getBody } from '../index.js'
import createRequest from './index.js'
import { parse as parseAbsoluteHttpUrl } from '../../absolute-http-url/index.js'

describe('createRequest', () => {
  it('makes a request and receives a response', async () => {
    await using duplicateRequestServer = createDuplicateRequestServer()
    await duplicateRequestServer.listen()

    const parsed = parseAbsoluteHttpUrl(
      `http://localhost:${duplicateRequestServer.port}`,
    )
    if (!parsed.ok) throw parsed.error

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
    })
    request.write('lorem ipsum')
    request.end()

    const response = await responsePromise

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('lorem ipsumlorem ipsum')
  })

  it('throws an error in case a connection cannot be made', async () => {
    // Get a free port by briefly listening then closing
    await using tempServer = createDuplicateRequestServer()
    await tempServer.listen()
    const freePort = tempServer.port
    await tempServer.close()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${freePort}`)
    if (!parsed.ok) throw parsed.error

    await expect(
      createRequest({
        url: parsed.value,
      }),
    ).rejects.toThrow()
  })

  it('retries up to `retries`', async () => {
    await using flakyServer = createFlakyServer()
    await flakyServer.listen()

    //
    // Even though flaky server returns a successful response on the
    // 3rd attempt, `createRequest` abstracts that.
    //

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${flakyServer.port}`)
    if (!parsed.ok) throw parsed.error

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: async () => {},
    })
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(200)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('dolor sit amet')
  })

  it('returns the last non-successful request if number of tries equals to `retries`', async () => {
    await using flakyServer = createFlakyServer()
    await flakyServer.listen()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${flakyServer.port}`)
    if (!parsed.ok) throw parsed.error

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 2,
      backoff: async () => {},
    })
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(500)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('')
  })

  it('backs off between retries', async () => {
    await using flakyServer = createFlakyServer()
    await flakyServer.listen()

    /** @type {jest.Mock<() => Promise<void>>} */
    const mockBackoff = jest.fn()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${flakyServer.port}`)
    if (!parsed.ok) throw parsed.error

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
    })
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    await responsePromise

    expect(mockBackoff).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 2xx responses', async () => {
    await using statusCodeServer = createStatusCodeServer()
    await statusCodeServer.listen()

    const parsed = parseAbsoluteHttpUrl(
      `http://localhost:${statusCodeServer.port}`,
    )
    if (!parsed.ok) throw parsed.error

    /** @type {jest.Mock<() => Promise<void>>} */
    const mockBackoff = jest.fn()

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
      headers: { 'response-status-code': '201' },
    })
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(201)
    expect(mockBackoff).not.toHaveBeenCalled()
  })

  it('does not retry on 4xx responses', async () => {
    await using statusCodeServer = createStatusCodeServer()
    await statusCodeServer.listen()

    const parsed = parseAbsoluteHttpUrl(
      `http://localhost:${statusCodeServer.port}`,
    )
    if (!parsed.ok) throw parsed.error

    /** @type {jest.Mock<() => Promise<void>>} */
    const mockBackoff = jest.fn()

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
      headers: { 'response-status-code': '404' },
    })
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(404)
    expect(mockBackoff).not.toHaveBeenCalled()
  })

  it('retries on 5xx responses', async () => {
    await using flakyServer = createFlakyServer()
    await flakyServer.listen()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${flakyServer.port}`)
    if (!parsed.ok) throw parsed.error

    /** @type {jest.Mock<() => Promise<void>>} */
    const mockBackoff = jest.fn()

    const [request, responsePromise] = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
    })
    request.write('dolor sit amet')
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    expect(mockBackoff).toHaveBeenCalled()
  })

  // Regression test
  it('survives a network error on a mid-loop retry attempt', async () => {
    // Server behaviour per connection:
    //   connection 1: returns 500  → loop retries
    //   connection 2: destroys socket immediately (mid-loop network error)
    //   connection 3: returns 200  → resolves
    let connectionCount = 0

    const { createServer: createHttpServer } = await import('node:http')

    const httpServer = createHttpServer((req, res) => {
      if (connectionCount === 3) {
        res.writeHead(200)
        req.pipe(res)
      } else {
        res.writeHead(500)
        res.end()
      }
    })

    httpServer.on('connection', (socket) => {
      connectionCount += 1
      if (connectionCount === 2) {
        // Destroy after TCP accept but before HTTP response — triggers
        // 'error' on the in-flight ClientRequest inside the retry loop
        socket.destroy()
      }
    })

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const port = /** @type {import('node:net').AddressInfo} */ (
      httpServer.address()
    ).port

    try {
      const parsed = parseAbsoluteHttpUrl(`http://127.0.0.1:${port}`)
      if (!parsed.ok) throw parsed.error

      const [request, responsePromise] = await createRequest({
        url: parsed.value,
        method: 'POST',
        retries: 3,
        backoff: async () => {},
      })
      request.write('hello')
      request.end()

      const response = await responsePromise
      expect(response.statusCode).toBe(200)
    } finally {
      await new Promise((resolve) => httpServer.close(resolve))
    }
  })

  // Regression test
  it('retries even if server cannot be reached', async () => {
    // Get a free port by briefly listening then closing
    await using tempServer = createDuplicateRequestServer()
    await tempServer.listen()
    const port = tempServer.port
    await tempServer.close()

    await using flakyServer = createFlakyServer()

    async function sendRequest() {
      const parsed = parseAbsoluteHttpUrl(`http://localhost:${port}`)
      if (!parsed.ok) throw parsed.error

      const [request, responsePromise] = await createRequest({
        url: parsed.value,
        method: 'POST',
        retries: 5,
        backoff: createBackoff({ initial: 10 }),
      })
      request.write('dolor')
      request.write(' sit amet')
      request.end()

      return responsePromise
    }

    async function startServerAfterDelay() {
      await sleep(10)
      await flakyServer.listen(port)
    }

    // Run `sendRequest` and `startServerAfterDelay` in parallel.
    // Server will be started after the first request was sent.
    const [responsePromise] = await Promise.all([
      sendRequest(),
      startServerAfterDelay(),
    ])

    const response = await responsePromise
    expect(response.statusCode).toBe(200)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('dolor sit amet')
  })
})
