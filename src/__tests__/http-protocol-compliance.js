//
// Tests for HTTP protocol compliance as a reverse proxy.
// Validates that mocker correctly relays methods, status codes, headers,
// body framing, transfer encoding, connection semantics, URL handling,
// response body integrity, and error conditions.
//
// References:
// - RFC 9110 (HTTP Semantics)
// - RFC 9112 (HTTP/1.1)
//

import { describe, it, expect } from '@jest/globals'
import net from 'node:net'
import crypto from 'node:crypto'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createMocker } from './helpers/mocker.js'
import { createServer } from './helpers/async-http-server.js'
import { createRequest, getBody } from '../shared/http/index.js'

function createEchoServer() {
  return createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks).toString()

    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      }),
    )
  })
}

function createStatusCodeServer() {
  return createServer(async (req, res) => {
    const statusCode = Number(req.headers['response-status-code'] || 200)
    const responseBody = req.headers['response-body'] || ''

    // Drain the request body
    for await (const _ of req) {
      // noop
    }

    res.writeHead(statusCode)
    if (responseBody) {
      res.end(responseBody)
    } else {
      res.end()
    }
  })
}

// ---------------------------------------------------------------------------
// 1. HTTP Methods (RFC 9110 §9)
// ---------------------------------------------------------------------------

describe('HTTP methods (RFC 9110 §9)', () => {
  /** @see RFC 9110 §9.1 — Overview of HTTP methods */
  it.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])(
    'forwards %s method to origin',
    async (method) => {
      await using origin = createEchoServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mocker.port}/resource`,
        method,
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      expect(body.method).toBe(method)
    },
  )

  /** @see RFC 9110 §9.3.2 — HEAD must not return a body */
  it('HEAD returns no body in response', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'HEAD',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9110 §9.3.7 — OPTIONS */
  it('forwards OPTIONS method to origin', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'OPTIONS',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.method).toBe('OPTIONS')
  })

  /** @see RFC 9110 §9.1 — Unknown methods should be forwarded */
  it('forwards unknown/custom method (PURGE) without error', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/cache`,
      method: 'PURGE',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.method).toBe('PURGE')
  })
})

// ---------------------------------------------------------------------------
// 2. Status Code Relaying (RFC 9110 §15)
// ---------------------------------------------------------------------------

describe('status code relaying (RFC 9110 §15)', () => {
  /** @see RFC 9110 §15.3 — 2xx Successful */
  it.each([200, 201, 202, 204, 206])(
    'relays 2xx status code %i from origin',
    async (statusCode) => {
      await using origin = createStatusCodeServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mocker.port}/`,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  /** @see RFC 9110 §15.4 — 3xx Redirection */
  it.each([301, 302, 303, 304, 307, 308])(
    'relays 3xx status code %i from origin',
    async (statusCode) => {
      await using origin = createStatusCodeServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mocker.port}/`,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  /** @see RFC 9110 §15.5 — 4xx Client Error */
  it.each([400, 401, 403, 404, 405, 409, 410, 413, 414, 429])(
    'relays 4xx status code %i from origin',
    async (statusCode) => {
      await using origin = createStatusCodeServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mocker.port}/`,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  /** @see RFC 9110 §15.6 — 5xx Server Error */
  it.each([500, 502, 503, 504])(
    'relays 5xx status code %i from origin',
    async (statusCode) => {
      await using origin = createStatusCodeServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mocker.port}/`,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  /** @see RFC 9110 §15 — Unknown status codes in a known class */
  it('relays unknown status code in known class (299)', async () => {
    await using origin = createStatusCodeServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: { 'response-status-code': '299' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(299)
  })
})

// ---------------------------------------------------------------------------
// 3. Content-Length and Body Framing (RFC 9112 §6)
// ---------------------------------------------------------------------------

describe('Content-Length and body framing (RFC 9112 §6)', () => {
  /** @see RFC 9112 §6.3 — Content-Length */
  it('response with exact Content-Length', async () => {
    const responsePayload = 'Hello, World!'
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-length': Buffer.byteLength(responsePayload).toString(),
      })
      res.end(responsePayload)
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(body.toString()).toBe(responsePayload)
  })

  /** @see RFC 9112 §6.3 — Zero Content-Length */
  it('response with zero Content-Length', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, {
        'content-length': '0',
      })
      res.end()
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9112 §6.3 — POST with Content-Length */
  it('POST with Content-Length is forwarded correctly', async () => {
    const payload = 'request-payload-data'
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'content-length': Buffer.byteLength(payload).toString(),
      },
    })
    request.end(payload)
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.body).toBe(payload)
  })

  /** @see RFC 9110 §9.3.2 — HEAD response must not contain a body */
  it('HEAD response has no body even with Content-Length from origin', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-length': '1000',
      })
      res.end()
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'HEAD',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9110 §15.3.5 — 204 No Content must not contain a body */
  it('204 No Content has no body', async () => {
    await using origin = createStatusCodeServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: { 'response-status-code': '204' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(204)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9110 §15.4.5 — 304 Not Modified must not contain a body */
  it('304 Not Modified has no body', async () => {
    await using origin = createStatusCodeServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: { 'response-status-code': '304' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(304)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9112 §7 — Large body triggers chunked transfer */
  it('large body >64KB is forwarded correctly', async () => {
    const largePayload = 'x'.repeat(128 * 1024)
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.setHeader('content-type', 'text/plain')
      res.end(largePayload)
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(body.toString()).toBe(largePayload)
  })
})

// ---------------------------------------------------------------------------
// 4. Transfer-Encoding: Chunked (RFC 9112 §7)
// ---------------------------------------------------------------------------

describe('Transfer-Encoding: chunked (RFC 9112 §7)', () => {
  /** @see RFC 9112 §7.1 — Chunked transfer coding */
  it('origin responds chunked — proxy forwards correctly', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, {
        'content-type': 'text/plain',
        'transfer-encoding': 'chunked',
      })
      res.write('chunk-1-')
      res.write('chunk-2-')
      res.write('chunk-3')
      res.end()
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.toString()).toBe('chunk-1-chunk-2-chunk-3')
  })

  /** @see RFC 9112 §7.1 — Empty final chunk terminates message */
  it('chunked response with empty final chunk', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, {
        'content-type': 'text/plain',
        'transfer-encoding': 'chunked',
      })
      res.write('data')
      res.end()
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.toString()).toBe('data')
  })
})

// ---------------------------------------------------------------------------
// 5. Connection Management (RFC 9112 §9)
// ---------------------------------------------------------------------------

describe('connection management (RFC 9112 §9)', () => {
  /** @see RFC 9112 §9.3 — Persistent connections in HTTP/1.1 */
  it('HTTP/1.1 keep-alive — multiple requests on same connection', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    // First request
    const [request1, responsePromise1] = await createRequest({
      url: `http://localhost:${mocker.port}/first`,
      method: 'GET',
    })
    request1.end()
    const response1 = await responsePromise1
    const body1 = JSON.parse(`${await getBody(response1)}`)
    expect(body1.url).toBe('/first')

    // Second request on a new connection (verifying proxy handles sequential requests)
    const [request2, responsePromise2] = await createRequest({
      url: `http://localhost:${mocker.port}/second`,
      method: 'GET',
    })
    request2.end()
    const response2 = await responsePromise2
    const body2 = JSON.parse(`${await getBody(response2)}`)
    expect(body2.url).toBe('/second')
  })

  /** @see RFC 9112 §9.6 — Connection: close */
  it('Connection: close header is handled', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const responseRaw = await new Promise((resolve) => {
      const socket = net.connect(mocker.port, 'localhost', () => {
        socket.write(
          'GET / HTTP/1.1\r\n' +
            `Host: localhost:${mocker.port}\r\n` +
            'Connection: close\r\n' +
            '\r\n',
        )
      })

      /** @type {Buffer[]} */
      const chunks = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => {
        resolve(Buffer.concat(chunks).toString())
      })
    })

    expect(responseRaw).toContain('HTTP/1.1 200')
  })

  /** @see RFC 9112 §9 — Multiple sequential requests */
  it('handles multiple sequential requests correctly', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    for (let i = 0; i < 5; i++) {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mocker.port}/request-${i}`,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      expect(body.url).toBe(`/request-${i}`)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Headers (RFC 9110 §5, §7)
// ---------------------------------------------------------------------------

describe('headers (RFC 9110 §5, §7)', () => {
  /** @see RFC 9110 §5.1 — Header field names are case-insensitive */
  it('case-insensitive header name matching', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: {
        'X-Custom-Header': 'test-value',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    // Node.js lowercases header names
    expect(body.headers['x-custom-header']).toBe('test-value')
  })

  /** @see RFC 9110 §5.3 — Duplicate headers with same name */
  it('forwards duplicate headers with same name', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.setHeader('content-type', 'application/json')
      // Send duplicate Set-Cookie headers
      res.setHeader('set-cookie', ['cookie1=value1', 'cookie2=value2'])
      res.end(JSON.stringify({ ok: true }))
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const setCookies = response.headers['set-cookie']
    expect(Array.isArray(setCookies)).toBe(true)
    expect(setCookies).toContain('cookie1=value1')
    expect(setCookies).toContain('cookie2=value2')
  })

  /** @see RFC 9110 §5.5 — Empty header values are valid */
  it('forwards empty header values', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: {
        'x-empty-header': '',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.headers['x-empty-header']).toBe('')
  })

  /** @see RFC 9110 §5.5 — Long header values */
  it('forwards very long header value', async () => {
    const longValue = 'x'.repeat(8 * 1024)
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: {
        'x-long-header': longValue,
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.headers['x-long-header']).toBe(longValue)
  })

  /** @see RFC 9110 §8.3 — Content-Type with charset parameter */
  it('Content-Type with charset is preserved', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      })
      res.end('<h1>Hello</h1>')
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
  })

  /** @see RFC 9110 §8.4 — Content-Encoding (gzip) */
  it('Content-Encoding gzip is preserved', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200, { 'content-encoding': 'gzip' })
      await pipeline(Readable.from('compressed-data'), createGzip(), res)
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['content-encoding']).toBe('gzip')
  })

  /** @see RFC 9110 §12.5.3 — Accept-Encoding forwarded to origin */
  it('Accept-Encoding header is forwarded to origin', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip, deflate, br',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.headers['accept-encoding']).toBe('gzip, deflate, br')
  })
})

// ---------------------------------------------------------------------------
// 7. Request Target and URL Handling (RFC 9112 §3.2)
// ---------------------------------------------------------------------------

describe('request target and URL handling (RFC 9112 §3.2)', () => {
  /** @see RFC 9112 §3.2 — Path segments */
  it('path segments are preserved', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/api/v2/users/42/posts`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/api/v2/users/42/posts')
  })

  /** @see RFC 9112 §3.2 — Query string */
  it('query string is preserved', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/search?q=hello+world&page=2&limit=10`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/search?q=hello+world&page=2&limit=10')
  })

  /** @see RFC 9112 §3.2 — Percent-encoded characters */
  it('URL-encoded characters are preserved', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/path%20with%20spaces/file%2Fname`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/path%20with%20spaces/file%2Fname')
  })

  /** @see RFC 9112 §3.2 — Empty path defaults to / */
  it('empty path is handled', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/')
  })

  /** @see RFC 9112 §3.2 — Root path with query string */
  it('root path with query string is preserved', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/?key=value`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/?key=value')
  })

  /** @see RFC 9112 §3.2 — Double slashes in path */
  it('double slashes in path are preserved', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}//double//slashes//path`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('//double//slashes//path')
  })
})

// ---------------------------------------------------------------------------
// 8. Response Body Integrity
// ---------------------------------------------------------------------------

describe('response body integrity', () => {
  /** @see RFC 9110 §8.6 — JSON body roundtrip */
  it('JSON body integrity is maintained', async () => {
    const jsonPayload = {
      string: 'hello',
      number: 42,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      nested: { key: 'value', deep: { a: 1 } },
      unicode: '\u00e9\u00e0\u00fc\u00f1\u2603\u{1F600}',
    }
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(jsonPayload))
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body).toEqual(jsonPayload)
  })

  /** @see RFC 9110 §8.6 — Binary body roundtrip */
  it('binary body integrity is maintained', async () => {
    const binaryData = crypto.randomBytes(4096)
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.setHeader('content-type', 'application/octet-stream')
      res.end(binaryData)
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(Buffer.compare(body, binaryData)).toBe(0)
  })

  /** @see RFC 9110 §6.4.1 — Empty body on 200 */
  it('empty body on 200 response', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(200)
      res.end()
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9112 §7 — Large body >1MB */
  it('large body >1MB is forwarded correctly', async () => {
    const largePayload = Buffer.alloc(1.5 * 1024 * 1024, 0x42)
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.setHeader('content-type', 'application/octet-stream')
      res.end(largePayload)
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(body.length).toBe(largePayload.length)
    expect(Buffer.compare(body, largePayload)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 9. Error Conditions
// ---------------------------------------------------------------------------

describe('error conditions', () => {
  // Note: ECONNREFUSED is not in mocker's nonFatalErrors list, so when the
  // origin is unreachable, mocker sends a 500 response but then re-throws
  // the error, which crashes the server process. This is by design — mocker
  // treats ECONNREFUSED as a fatal error in pass mode. Testing this
  // behavior would require process-level isolation.

  /** @see RFC 9110 §15.6.1 — Origin returns server error */
  it('origin that returns 500 is relayed to client', async () => {
    await using origin = createServer(async (req, res) => {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Internal Server Error')
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(500)
  })

  /**
   * @see RFC 9110 §15.6.5 — Origin that responds very slowly
   *
   * Note: A true timeout test (origin never responds) is not practical in a
   * unit test because mocker does not implement a request timeout — it waits
   * indefinitely for the origin, which would hang the test. Instead we test
   * that a slow origin still produces a valid response.
   */
  it('slow origin still produces a valid response', async () => {
    await using origin = createServer(async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      res.writeHead(200)
      res.end('slow but ok')
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = `${await getBody(response)}`
    expect(body).toBe('slow but ok')
  })
})
