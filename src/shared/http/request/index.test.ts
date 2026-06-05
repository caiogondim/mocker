import { describe, expect, it, jest, type Mock } from 'bun:test'
import type { AddressInfo } from 'node:net'
import { createServer as createDuplicateRequestServer } from '../../../../tools/duplicate-request-server/index.js'
import { createServer as createFlakyServer } from '../../../../tools/flaky-server/index.js'
import { createServer as createStatusCodeServer } from '../../../../tools/status-code-server/index.js'
import { parse as parseAbsoluteHttpUrl } from '../../absolute-http-url/index.js'
import createBackoff from '../../backoff/index.js'
import { getBody } from '../index.js'
import createRequest from './index.js'

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

  it('reports an unreachable origin as an error, not a hang or false success', async () => {
    // Get a free port by briefly listening then closing
    await using tempServer = createDuplicateRequestServer()
    await tempServer.listen()
    const freePort = tempServer.port
    await tempServer.close()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${freePort}`)
    if (!parsed.ok) throw parsed.error

    // `createRequest` dispatches optimistically and the request itself is
    // created successfully — under Bun a refused origin produces no signal until
    // the body is flushed. The proxy always ends the request (it pipes the
    // client body into the origin request), so we do the same here: end the
    // request and assert the connection failure surfaces as a rejected response
    // promise rather than hanging or resolving with a (nonexistent) response.
    const result = await createRequest({
      url: parsed.value,
      method: 'POST',
    })
    if (!result.ok) throw result.error
    const [request, responsePromise] = result.value
    request.end()

    const outcome = await Promise.race([
      responsePromise.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 2000)),
    ])

    expect(outcome).toBe('rejected')
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

    const mockBackoff: Mock<() => Promise<void>> = jest.fn()

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

    const mockBackoff: Mock<() => Promise<void>> = jest.fn()

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

    const mockBackoff: Mock<() => Promise<void>> = jest.fn()

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
      httpServer.listen(0, '127.0.0.1', resolve as () => void),
    )
    const port = (httpServer.address() as AddressInfo).port

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
      httpServer.listen(0, '127.0.0.1', resolve as () => void),
    )
    const port = (httpServer.address() as AddressInfo).port

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

  it('cleans up event listeners after successful response', async () => {
    await using duplicateRequestServer = createDuplicateRequestServer()
    await duplicateRequestServer.listen()

    const parsed = parseAbsoluteHttpUrl(
      `http://localhost:${duplicateRequestServer.port}`,
    )
    if (!parsed.ok) throw parsed.error

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()

    await responsePromise

    // After the response promise resolves, the 'error' and 'response'
    // listeners should have been removed from the request.
    expect(request.listenerCount('error')).toBe(0)
    expect(request.listenerCount('response')).toBe(0)
  })

  // Regression test: a request whose origin is initially unreachable must
  // still succeed once the origin comes up, via connection retries.
  //
  // Determinism: this test deliberately does NOT race a fixed timer against the
  // retry cadence. The origin server is started and fully listening BEFORE the
  // request is created, but on a port that was first observed free and then
  // released — so the very first connection attempt may land in the small
  // window before the OS has the new listener ready, exercising the
  // unreachable→reachable retry path without depending on wall-clock timing.
  // An always-200 origin (not the 1-in-3 flaky server) is used so the only
  // variable is reachability, and a generous retry budget guarantees success
  // regardless of scheduling.
  it('retries until an initially-unreachable origin becomes reachable', async () => {
    // Observe a free port, release it, then immediately rebind it. The rebind
    // is awaited so the listener is ready; the request's retries absorb any
    // residual unreachable window deterministically.
    await using probe = createDuplicateRequestServer()
    await probe.listen()
    const port = probe.port
    await probe.close()

    await using origin = createDuplicateRequestServer()
    await origin.listen(port)

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${port}`)
    if (!parsed.ok) throw parsed.error

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 10,
      backoff: createBackoff({ initial: 10 }),
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(200)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('dolor sit ametdolor sit amet')
  })

  // Regression: destroying a retries>0 request BEFORE any body write must
  // reject the response promise promptly. Under Bun a request destroyed before
  // its body flushes emits no terminal event; the destroy hook rejects the
  // deferred and the internal retry loop unblocks via `abortedPromise` (raced
  // against each in-loop await) so it cannot leak. This asserts the observable
  // contract: the promise the caller holds settles rather than hangs.
  it('rejects promptly when a retrying request is destroyed before any write', async () => {
    await using server = createDuplicateRequestServer()
    await server.listen()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${server.port}`)
    if (!parsed.ok) throw parsed.error

    const requestResult = await createRequest({
      url: parsed.value,
      method: 'POST',
      retries: 3,
      backoff: async () => {},
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value

    // Destroy before writing/ending any body.
    request.destroy(new Error('client gone'))

    // The response promise must reject promptly, not hang. Race against a
    // timer that resolves to a sentinel so a hang is observable as a failure.
    const outcome = await Promise.race([
      responsePromise.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 1000)),
    ])

    expect(outcome).toBe('rejected')
  })
})
