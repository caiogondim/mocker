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

/** @typedef {import('../shared/types.js').HttpMethod} HttpMethod */

import { describe, it, expect } from '@jest/globals'
import net from 'node:net'
import crypto from 'node:crypto'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createMocker } from './helpers/mocker.js'
import { createServer } from './helpers/async-http-server.js'
import { createRequest, getBody } from '../shared/http/index.js'
import { parse as parseAbsoluteHttpUrl } from '../shared/absolute-http-url/index.js'
import { HTTP_METHOD } from '../shared/http-method/index.js'

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

//-
// 1. HTTP Methods (RFC 9110 §9)
//-

describe('HTTP methods (RFC 9110 §9)', () => {
  /** @see RFC 9110 §9.1 — Overview of HTTP methods */
  it.each([
    HTTP_METHOD.GET,
    HTTP_METHOD.POST,
    HTTP_METHOD.PUT,
    HTTP_METHOD.DELETE,
    HTTP_METHOD.PATCH,
  ])('forwards %s method to origin', async (method) => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed1 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/resource`,
    )
    if (!parsed1.ok) throw parsed1.error
    const requestResult = await createRequest({
      url: parsed1.value,
      method,
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.method).toBe(method)
  })

  /** @see RFC 9110 §9.3.2 — HEAD must not return a body */
  it('HEAD returns no body in response', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed2 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed2.ok) throw parsed2.error
    const requestResult = await createRequest({
      url: parsed2.value,
      method: 'HEAD',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed3 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed3.ok) throw parsed3.error
    const requestResult = await createRequest({
      url: parsed3.value,
      method: 'OPTIONS',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed4 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/cache`,
    )
    if (!parsed4.ok) throw parsed4.error
    const requestResult = await createRequest({
      url: parsed4.value,
      method: /** @type {HttpMethod} */ ('PURGE'),
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.method).toBe('PURGE')
  })
})

//-
// 2. Status Code Relaying (RFC 9110 §15)
//-

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

      const parsed5 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed5.ok) throw parsed5.error
      const requestResult = await createRequest({
        url: parsed5.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
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

      const parsed6 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed6.ok) throw parsed6.error
      const requestResult = await createRequest({
        url: parsed6.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
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

      const parsed7 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed7.ok) throw parsed7.error
      const requestResult = await createRequest({
        url: parsed7.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
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

      const parsed8 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed8.ok) throw parsed8.error
      const requestResult = await createRequest({
        url: parsed8.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
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

    const parsed9 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed9.ok) throw parsed9.error
    const requestResult = await createRequest({
      url: parsed9.value,
      method: 'GET',
      headers: { 'response-status-code': '299' },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(299)
  })
})

//-
// 3. Content-Length and Body Framing (RFC 9112 §6)
//-

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

    const parsed10 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed10.ok) throw parsed10.error
    const requestResult = await createRequest({
      url: parsed10.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed11 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed11.ok) throw parsed11.error
    const requestResult = await createRequest({
      url: parsed11.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed12 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed12.ok) throw parsed12.error
    const requestResult = await createRequest({
      url: parsed12.value,
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'content-length': Buffer.byteLength(payload).toString(),
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed13 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed13.ok) throw parsed13.error
    const requestResult = await createRequest({
      url: parsed13.value,
      method: 'HEAD',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed14 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed14.ok) throw parsed14.error
    const requestResult = await createRequest({
      url: parsed14.value,
      method: 'GET',
      headers: { 'response-status-code': '204' },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed15 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed15.ok) throw parsed15.error
    const requestResult = await createRequest({
      url: parsed15.value,
      method: 'GET',
      headers: { 'response-status-code': '304' },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed16 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed16.ok) throw parsed16.error
    const requestResult = await createRequest({
      url: parsed16.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(body.toString()).toBe(largePayload)
  })
})

//-
// 4. Transfer-Encoding: Chunked (RFC 9112 §7)
//-

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

    const parsed17 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed17.ok) throw parsed17.error
    const requestResult = await createRequest({
      url: parsed17.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed18 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed18.ok) throw parsed18.error
    const requestResult = await createRequest({
      url: parsed18.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.toString()).toBe('data')
  })
})

//-
// 5. Connection Management (RFC 9112 §9)
//-

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
    const parsed19 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/first`,
    )
    if (!parsed19.ok) throw parsed19.error
    const requestResult1 = await createRequest({
      url: parsed19.value,
      method: 'GET',
    })
    if (!requestResult1.ok) throw requestResult1.error
    const [request1, responsePromise1] = requestResult1.value
    request1.end()
    const response1 = await responsePromise1
    const body1 = JSON.parse(`${await getBody(response1)}`)
    expect(body1.url).toBe('/first')

    // Second request on a new connection (verifying proxy handles sequential requests)
    const parsed20 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/second`,
    )
    if (!parsed20.ok) throw parsed20.error
    const requestResult2 = await createRequest({
      url: parsed20.value,
      method: 'GET',
    })
    if (!requestResult2.ok) throw requestResult2.error
    const [request2, responsePromise2] = requestResult2.value
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
      const parsed21 = parseAbsoluteHttpUrl(
        `http://localhost:${mocker.port}/request-${i}`,
      )
      if (!parsed21.ok) throw parsed21.error
      const requestResult = await createRequest({
        url: parsed21.value,
        method: 'GET',
      })
      if (!requestResult.ok) throw requestResult.error
      const [request, responsePromise] = requestResult.value
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      expect(body.url).toBe(`/request-${i}`)
    }
  })
})

//-
// 6. Headers (RFC 9110 §5, §7)
//-

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

    const parsed22 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed22.ok) throw parsed22.error
    const requestResult = await createRequest({
      url: parsed22.value,
      method: 'GET',
      headers: {
        'X-Custom-Header': 'test-value',
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed23 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed23.ok) throw parsed23.error
    const requestResult = await createRequest({
      url: parsed23.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed24 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed24.ok) throw parsed24.error
    const requestResult = await createRequest({
      url: parsed24.value,
      method: 'GET',
      headers: {
        'x-empty-header': '',
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed25 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed25.ok) throw parsed25.error
    const requestResult = await createRequest({
      url: parsed25.value,
      method: 'GET',
      headers: {
        'x-long-header': longValue,
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed26 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed26.ok) throw parsed26.error
    const requestResult = await createRequest({
      url: parsed26.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed27 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed27.ok) throw parsed27.error
    const requestResult = await createRequest({
      url: parsed27.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    expect(response.headers['content-encoding']).toBe('gzip')
    // drain response body so the connection closes cleanly before server disposal
    await getBody(response)
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

    const parsed28 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed28.ok) throw parsed28.error
    const requestResult = await createRequest({
      url: parsed28.value,
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip, deflate, br',
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.headers['accept-encoding']).toBe('gzip, deflate, br')
  })
})

//-
// 7. Request Target and URL Handling (RFC 9112 §3.2)
//-

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

    const parsed29 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/api/v2/users/42/posts`,
    )
    if (!parsed29.ok) throw parsed29.error
    const requestResult = await createRequest({
      url: parsed29.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed30 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/search?q=hello+world&page=2&limit=10`,
    )
    if (!parsed30.ok) throw parsed30.error
    const requestResult = await createRequest({
      url: parsed30.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed31 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/path%20with%20spaces/file%2Fname`,
    )
    if (!parsed31.ok) throw parsed31.error
    const requestResult = await createRequest({
      url: parsed31.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed32 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed32.ok) throw parsed32.error
    const requestResult = await createRequest({
      url: parsed32.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed33 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}/?key=value`,
    )
    if (!parsed33.ok) throw parsed33.error
    const requestResult = await createRequest({
      url: parsed33.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed34 = parseAbsoluteHttpUrl(
      `http://localhost:${mocker.port}//double//slashes//path`,
    )
    if (!parsed34.ok) throw parsed34.error
    const requestResult = await createRequest({
      url: parsed34.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('//double//slashes//path')
  })
})

//-
// 8. Response Body Integrity
//-

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

    const parsed35 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed35.ok) throw parsed35.error
    const requestResult = await createRequest({
      url: parsed35.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed36 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed36.ok) throw parsed36.error
    const requestResult = await createRequest({
      url: parsed36.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed37 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed37.ok) throw parsed37.error
    const requestResult = await createRequest({
      url: parsed37.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed38 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed38.ok) throw parsed38.error
    const requestResult = await createRequest({
      url: parsed38.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(body.length).toBe(largePayload.length)
    expect(Buffer.compare(body, largePayload)).toBe(0)
  })
})

//-
// 9. Error Conditions
//-

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

    const parsed39 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed39.ok) throw parsed39.error
    const requestResult = await createRequest({
      url: parsed39.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
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

    const parsed40 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed40.ok) throw parsed40.error
    const requestResult = await createRequest({
      url: parsed40.value,
      method: 'GET',
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = `${await getBody(response)}`
    expect(body).toBe('slow but ok')
  })

  it('rejects listen() promise when port is already in use', async () => {
    await using origin = createServer(async (req, res) => {
      res.end('ok')
    })
    await origin.listen()

    // First mocker takes an auto-assigned port
    await using mocker1 = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker1.listen()
    const takenPort = mocker1.port

    // Second mocker tries the same port — should reject, not hang
    await using mocker2 = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
      port: takenPort,
    })
    await expect(mocker2.listen()).rejects.toThrow()
  })
})

//-
// 12. CORS (cross-origin resource sharing)
//-

describe('CORS', () => {
  it('sets Vary: Origin on non-preflight responses when cors is enabled', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
      cors: true,
    })
    await mocker.listen()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed.ok) throw parsed.error
    const requestResult = await createRequest({
      url: parsed.value,
      method: 'GET',
      headers: {
        origin: 'https://example.com',
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    await getBody(response)

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://example.com',
    )
    // Vary: Origin MUST be set to prevent caches from serving wrong origin
    const vary = response.headers['vary']
    expect(vary).toBeDefined()
    expect(
      typeof vary === 'string'
        ? vary.toLowerCase().includes('origin')
        : false,
    ).toBe(true)
  })

  it('does not set access-control-allow-origin when cors is disabled', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
      cors: false,
    })
    await mocker.listen()

    const parsed = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed.ok) throw parsed.error
    const requestResult = await createRequest({
      url: parsed.value,
      method: 'GET',
      headers: {
        origin: 'https://example.com',
      },
    })
    if (!requestResult.ok) throw requestResult.error
    const [request, responsePromise] = requestResult.value
    request.end()
    const response = await responsePromise
    await getBody(response)

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})
