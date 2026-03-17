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

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.write('lorem ipsum')
    request.end()

    const response = await responsePromise

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('lorem ipsumlorem ipsum')
  })

  it('returns an error result in case a connection cannot be made', async () => {
    // Get a free port by briefly listening then closing
    await using tempServer = createDuplicateRequestServer()
    await tempServer.listen()
    const freePort = tempServer.port
    await tempServer.close()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${freePort}`)
    if (!parsed.ok) throw parsed.error

    const result = await createRequest({
      url: parsed.value,
    })
    expect(result.ok).toBe(false)
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

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: async () => {},
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 2,
      backoff: async () => {},
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
      headers: { 'response-status-code': '201' },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
      headers: { 'response-status-code': '404' },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(404)
    expect(mockBackoff).not.toHaveBeenCalled()
  })

  it('throws when request.end payload pushes replay buffer over 1GB', async () => {
    await using flakyServer = createFlakyServer()
    await flakyServer.listen()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${flakyServer.port}`)
    if (!parsed.ok) throw parsed.error

    const originalByteLength = Buffer.byteLength
    const byteLengthSpy = jest.spyOn(Buffer, 'byteLength')
    byteLengthSpy.mockImplementation((value, encoding) => {
      if (value === 'trigger-limit') {
        return 1024 * 1024 * 1024
      }
      if (typeof value === 'string') {
        return originalByteLength(value, encoding)
      }
      return originalByteLength(value)
    })

    try {
      const requestResult = await createRequest({
        url: parsed.value,
        method: 'POST',
        retries: 3,
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
      request.write('x')
      expect(() => request.end('trigger-limit')).toThrow(
        'Request body exceeds replay limit',
      )
      request.destroy()
      await responsePromise.catch(() => {})
    } finally {
      byteLengthSpy.mockRestore()
    }
  })

  it('throws when cumulative request writes send more than 1GB', async () => {
    const { createServer: createHttpServer } = await import('node:http')
    const httpServer = createHttpServer((req, res) => {
      req.on('data', () => {})
      req.on('end', () => {
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise((resolve) =>
      httpServer.listen(0, '127.0.0.1', /** @type {() => void} */ (resolve)),
    )
    const port = /** @type {import('node:net').AddressInfo} */ (
      httpServer.address()
    ).port

    try {
      const parsed = parseAbsoluteHttpUrl(`http://127.0.0.1:${port}`)
      if (!parsed.ok) throw parsed.error

      const requestResult = await createRequest({
        url: parsed.value,
        method: 'POST',
        retries: 1,
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value

      const chunk = Buffer.alloc(8 * 1024 * 1024, 'a')
      for (let i = 0; i < 128; i += 1) {
        const canContinue = request.write(chunk)
        if (!canContinue) {
          await new Promise((resolve) => request.once('drain', resolve))
        }
      }

      expect(() => request.write(Buffer.from('x'))).toThrow(
        'Request body exceeds replay limit',
      )
      request.destroy()
      await responsePromise.catch(() => {})
    } finally {
      await new Promise((resolve) => httpServer.close(resolve))
    }
  }, 60000)

  // Regression test
  it('survives a network error on a mid-loop retry attempt', async () => {
    // Server behaviour per request:
    //   request 1: returns 500  → loop retries
    //   request 2: destroys socket (mid-loop network error)
    //   request 3: returns 200  → resolves
    let requestCount = 0

    const { createServer: createHttpServer } = await import('node:http')

    const httpServer = createHttpServer((req, res) => {
      requestCount += 1
      if (requestCount === 2) {
        req.socket.destroy()
        return
      }

      if (requestCount === 3) {
        res.writeHead(200)
        req.pipe(res)
      } else {
        res.writeHead(500)
        res.end()
      }
    })

    await new Promise((resolve) =>
      httpServer.listen(0, '127.0.0.1', /** @type {() => void} */ (resolve)),
    )
    const port = /** @type {import('node:net').AddressInfo} */ (
      httpServer.address()
    ).port

    try {
      const parsed = parseAbsoluteHttpUrl(`http://127.0.0.1:${port}`)
      if (!parsed.ok) throw parsed.error

      const requestResult = await createRequest({
        url: parsed.value,
        method: 'POST',
        retries: 3,
        backoff: async () => {},
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
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

      const requestResult = await createRequest({
        url: parsed.value,
        method: 'POST',
        retries: 5,
        backoff: createBackoff({ initial: 10 }),
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
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
