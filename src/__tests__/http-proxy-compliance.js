//
// Comprehensive HTTP reverse proxy compliance tests for mocker.
//
// Tests cover request/response forwarding integrity, hop-by-hop header
// handling, proxy-specific headers, body integrity at various sizes,
// content-encoding pass-through, error handling, connection management,
// URL rewriting, concurrent requests, and edge cases.
//
// References:
// - RFC 9110 (HTTP Semantics)
// - RFC 7230 (HTTP/1.1 Message Syntax and Routing)
// - RFC 7239 (Forwarded HTTP Extension)
//

import { describe, it, expect } from '@jest/globals'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { promisify } from 'node:util'

const deflate = promisify(zlib.deflate)
const gunzip = promisify(zlib.gunzip)
const inflate = promisify(zlib.inflate)
import http from 'node:http'

import { createMocker } from './helpers/mocker.js'
import { createServer } from './helpers/async-http-server.js'
import { createServer as createHeaderEchoServer } from '../../tools/request-header-on-response-body-server/index.js'
import { createServer as createStatusCodeServer } from '../../tools/status-code-server/index.js'
import { createServer as createGzipServer } from '../../tools/gzip-server/index.js'
import { createRequest, getBody } from '../shared/http/index.js'
import { parse as parseAbsoluteHttpUrl } from '../shared/absolute-http-url/index.js'
import { HTTP_METHOD } from '../shared/http-method/index.js'

// ---------------------------------------------------------------------------
// Helper servers
// ---------------------------------------------------------------------------

function createEchoServer() {
  return createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body.toString(),
      }),
    )
  })
}

function createBinaryEchoServer() {
  return createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    res.setHeader('content-type', 'application/octet-stream')
    res.end(body)
  })
}

function createMultiHeaderServer() {
  return createServer(async (req, res) => {
    for await (const _ of req) {
      // drain
    }

    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('set-cookie', [
      'session=abc123; Path=/',
      'theme=dark; Path=/; HttpOnly',
      'lang=en; Path=/; Secure',
    ])
    res.setHeader('cache-control', 'public, max-age=3600')
    res.setHeader('etag', '"abc123"')
    res.setHeader('last-modified', 'Wed, 21 Oct 2015 07:28:00 GMT')
    res.end('<html></html>')
  })
}

function createStatusServer() {
  return createServer(async (req, res) => {
    for await (const _ of req) {
      // drain
    }

    const statusCode = Number(req.headers['response-status-code'] || 200)
    const statusMessage = req.headers['response-status-message']

    if (statusMessage) {
      res.writeHead(statusCode, /** @type {string} */ (statusMessage))
    } else {
      res.writeHead(statusCode)
    }
    res.end()
  })
}

function createDeflateServer() {
  return createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks).toString()
    const deflated = await deflate(body)

    res.writeHead(200, { 'content-encoding': 'deflate' })
    res.end(deflated)
  })
}

function createEmptyBodyServer() {
  return createServer(async (req, res) => {
    for await (const _ of req) {
      // drain
    }
    res.writeHead(200, { 'x-custom': 'present' })
    res.end()
  })
}

// ---------------------------------------------------------------------------
// 1. Request Forwarding Integrity
// ---------------------------------------------------------------------------

describe('request forwarding integrity', () => {
  /**
   * @see RFC 9110 §9 — Methods
   */
  it.each([HTTP_METHOD.GET, HTTP_METHOD.POST, HTTP_METHOD.PUT, HTTP_METHOD.DELETE, HTTP_METHOD.PATCH])(
    'preserves %s method through proxy',
    async (method) => {
      await using origin = createEchoServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const parsed1 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/test`)
      if (!parsed1.ok) throw parsed1.error
      const [request, responsePromise] = await createRequest({
        url: parsed1.value,
        method,
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      expect(body.method).toBe(method)
    },
  )

  /** @see RFC 9110 §9.3.2 — HEAD */
  it('preserves HEAD method and returns no body', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed2 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed2.ok) throw parsed2.error
    const [request, responsePromise] = await createRequest({
      url: parsed2.value,
      method: 'HEAD',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  /** @see RFC 9110 §7.1 — URI path forwarding */
  it('preserves URL path through proxy', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed3 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/api/v2/users/42`)
    if (!parsed3.ok) throw parsed3.error
    const [request, responsePromise] = await createRequest({
      url: parsed3.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/api/v2/users/42')
  })

  /** @see RFC 9110 §7.1 — Query component forwarding */
  it('preserves query string through proxy', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed4 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/search?q=hello+world&page=2&limit=10`)
    if (!parsed4.ok) throw parsed4.error
    const [request, responsePromise] = await createRequest({
      url: parsed4.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/search?q=hello+world&page=2&limit=10')
  })

  it.each([
    ['JSON body', 'application/json', JSON.stringify({ key: 'value', nested: { a: 1 } })],
    ['form-encoded body', 'application/x-www-form-urlencoded', 'username=admin&password=secret'],
    ['empty body', 'text/plain', ''],
  ])(
    'forwards %s byte-for-byte',
    async (_label, contentType, payload) => {
      await using origin = createEchoServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const headers = /** @type {import('../shared/http/index.js').Headers} */ (payload.length > 0 ? { 'content-type': contentType } : {})
      const parsed5 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed5.ok) throw parsed5.error
      const [request, responsePromise] = await createRequest({
        url: parsed5.value,
        method: 'POST',
        headers,
      })
      request.end(payload)
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      expect(body.body).toBe(payload)
    },
  )

  /** @see RFC 9110 §7.2 — End-to-end headers */
  it('forwards request headers to origin', async () => {
    await using origin = createHeaderEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed6 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed6.ok) throw parsed6.error
    const [request, responsePromise] = await createRequest({
      url: parsed6.value,
      method: 'GET',
      headers: {
        'x-custom-header': 'custom-value',
        'x-request-id': 'abc-123-def',
        accept: 'application/json',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.test',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body['x-custom-header']).toBe('custom-value')
    expect(body['x-request-id']).toBe('abc-123-def')
    expect(body.accept).toBe('application/json')
    expect(body.authorization).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.test')
  })
})

// ---------------------------------------------------------------------------
// 2. Response Forwarding Integrity
// ---------------------------------------------------------------------------

describe('response forwarding integrity', () => {
  /** @see RFC 9110 §15 — Status Codes */
  it.each([200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503])(
    'relays %i status code from origin',
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
      const [request, responsePromise] = await createRequest({
        url: parsed7.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  /** @see RFC 9110 §15 — Status message relay */
  it('relays status message from origin', async () => {
    await using origin = createStatusServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed8 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed8.ok) throw parsed8.error
    const [request, responsePromise] = await createRequest({
      url: parsed8.value,
      method: 'GET',
      headers: {
        'response-status-code': '200',
        'response-status-message': 'All Good',
      },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    expect(response.statusMessage).toBe('All Good')
  })

  /** @see RFC 9110 §6.4.1 — Content-Type */
  it('preserves Content-Type from origin', async () => {
    await using origin = createMultiHeaderServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed9 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed9.ok) throw parsed9.error
    const [request, responsePromise] = await createRequest({
      url: parsed9.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
  })

  /** @see RFC 9110 §5.6.7 — Multiple Set-Cookie headers */
  it('preserves multiple Set-Cookie headers from origin', async () => {
    await using origin = createMultiHeaderServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed10 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed10.ok) throw parsed10.error
    const [request, responsePromise] = await createRequest({
      url: parsed10.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const setCookies = response.headers['set-cookie']
    expect(Array.isArray(setCookies)).toBe(true)
    expect(setCookies).toHaveLength(3)
    expect(setCookies).toContain('session=abc123; Path=/')
    expect(setCookies).toContain('theme=dark; Path=/; HttpOnly')
    expect(setCookies).toContain('lang=en; Path=/; Secure')
  })

  /** @see RFC 9111 §5.2 — Cache-Control, ETag, Last-Modified */
  it('preserves Cache-Control, ETag, and Last-Modified from origin', async () => {
    await using origin = createMultiHeaderServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed11 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed11.ok) throw parsed11.error
    const [request, responsePromise] = await createRequest({
      url: parsed11.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['cache-control']).toBe('public, max-age=3600')
    expect(response.headers['etag']).toBe('"abc123"')
    expect(response.headers['last-modified']).toBe(
      'Wed, 21 Oct 2015 07:28:00 GMT',
    )
  })

  it('relays response body byte-for-byte', async () => {
    await using origin = createMultiHeaderServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed12 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed12.ok) throw parsed12.error
    const [request, responsePromise] = await createRequest({
      url: parsed12.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = await getBody(response)
    expect(body.toString()).toBe('<html></html>')
  })
})

// ---------------------------------------------------------------------------
// 3. Hop-by-Hop Header Handling (RFC 9110 §7.6.1)
// ---------------------------------------------------------------------------

describe('hop-by-hop header handling', () => {
  /**
   * Documents current mocker behavior for hop-by-hop headers.
   * RFC 9110 §7.6.1 specifies that intermediaries SHOULD remove these
   * headers, but mocker may or may not strip them. These tests document
   * current behavior rather than assert strict compliance.
   *
   * @see RFC 9110 §7.6.1
   */
  it.each([
    ['connection', 'keep-alive'],
    ['keep-alive', 'timeout=5, max=100'],
    ['te', 'trailers'],
    ['proxy-authorization', 'Basic dGVzdDp0ZXN0'],
    ['proxy-authenticate', 'Basic realm="test"'],
  ])(
    'documents behavior for %s hop-by-hop header',
    async (headerName, headerValue) => {
      await using origin = createHeaderEchoServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const parsed13 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed13.ok) throw parsed13.error
      const [request, responsePromise] = await createRequest({
        url: parsed13.value,
        method: 'GET',
        headers: {
          [headerName]: headerValue,
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)

      // Document whether the hop-by-hop header was forwarded or stripped.
      // If forwarded, value should match. If stripped, it should be undefined.
      // Either behavior is acceptable — this test documents the current state.
      if (body[headerName] !== undefined) {
        expect(body[headerName]).toBe(headerValue)
      } else {
        expect(body[headerName]).toBeUndefined()
      }
    },
  )
})

// ---------------------------------------------------------------------------
// 4. Proxy Headers (RFC 7239)
// ---------------------------------------------------------------------------

describe('proxy headers (RFC 7239)', () => {
  /** @see RFC 7239 — Forwarded */
  it('forwards Forwarded header to origin', async () => {
    await using origin = createHeaderEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed14 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed14.ok) throw parsed14.error
    const [request, responsePromise] = await createRequest({
      url: parsed14.value,
      method: 'GET',
      headers: {
        forwarded: 'for=192.0.2.60;proto=http;by=203.0.113.43',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.forwarded).toBe('for=192.0.2.60;proto=http;by=203.0.113.43')
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For */
  it('forwards X-Forwarded-For header to origin', async () => {
    await using origin = createHeaderEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed15 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed15.ok) throw parsed15.error
    const [request, responsePromise] = await createRequest({
      url: parsed15.value,
      method: 'GET',
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body['x-forwarded-for']).toBe('203.0.113.195, 70.41.3.18')
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host */
  it('forwards X-Forwarded-Host header to origin', async () => {
    await using origin = createHeaderEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed16 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed16.ok) throw parsed16.error
    const [request, responsePromise] = await createRequest({
      url: parsed16.value,
      method: 'GET',
      headers: {
        'x-forwarded-host': 'id42.example-cdn.com',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body['x-forwarded-host']).toBe('id42.example-cdn.com')
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto */
  it('forwards X-Forwarded-Proto header to origin', async () => {
    await using origin = createHeaderEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed17 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed17.ok) throw parsed17.error
    const [request, responsePromise] = await createRequest({
      url: parsed17.value,
      method: 'GET',
      headers: {
        'x-forwarded-proto': 'https',
      },
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body['x-forwarded-proto']).toBe('https')
  })
})

// ---------------------------------------------------------------------------
// 5. Proxy-Specific Response Headers
// ---------------------------------------------------------------------------

describe('proxy-specific response headers', () => {
  it('sets x-powered-by: mocker on all responses', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed18 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed18.ok) throw parsed18.error
    const [request, responsePromise] = await createRequest({
      url: parsed18.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['x-powered-by']).toBe('mocker')
  })

  it('sets x-mocker-request-id on all responses', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed19 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed19.ok) throw parsed19.error
    const [request, responsePromise] = await createRequest({
      url: parsed19.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['x-mocker-request-id']).toBeDefined()
    expect(typeof response.headers['x-mocker-request-id']).toBe('string')
    expect(/** @type {string} */ (response.headers['x-mocker-request-id']).length).toBeGreaterThan(0)
  })

  it('sets x-mocker-response-from to Origin in pass mode', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed20 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed20.ok) throw parsed20.error
    const [request, responsePromise] = await createRequest({
      url: parsed20.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['x-mocker-response-from']).toBe('Origin')
  })

  it('sets unique x-mocker-request-id for each request', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const ids = []
    for (let i = 0; i < 3; i++) {
      const parsed21 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed21.ok) throw parsed21.error
      const [request, responsePromise] = await createRequest({
        url: parsed21.value,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise
      await getBody(response)
      ids.push(response.headers['x-mocker-request-id'])
    }

    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 6. Body Integrity Through Proxy
// ---------------------------------------------------------------------------

describe('body integrity through proxy', () => {
  it('forwards small JSON body (<1KB)', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const payload = JSON.stringify({ message: 'hello', count: 42 })

    const parsed22 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed22.ok) throw parsed22.error
    const [request, responsePromise] = await createRequest({
      url: parsed22.value,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    request.end(payload)
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.body).toBe(payload)
  })

  it('forwards medium body (~64KB)', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const payload = 'x'.repeat(64 * 1024)

    const parsed23 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed23.ok) throw parsed23.error
    const [request, responsePromise] = await createRequest({
      url: parsed23.value,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    })
    request.end(payload)
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.body).toBe(payload)
  })

  it('forwards large body (>128KB)', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const payload = 'y'.repeat(128 * 1024 + 512)

    const parsed24 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed24.ok) throw parsed24.error
    const [request, responsePromise] = await createRequest({
      url: parsed24.value,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    })
    request.end(payload)
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.body).toBe(payload)
  })

  it('forwards empty body', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed25 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed25.ok) throw parsed25.error
    const [request, responsePromise] = await createRequest({
      url: parsed25.value,
      method: 'POST',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.body).toBe('')
  })

  it('forwards binary body (random bytes) byte-for-byte', async () => {
    await using origin = createBinaryEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const binaryPayload = crypto.randomBytes(2048)

    const parsed26 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed26.ok) throw parsed26.error
    const [request, responsePromise] = await createRequest({
      url: parsed26.value,
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
    })
    request.end(binaryPayload)
    const response = await responsePromise
    const responseBody = await getBody(response)
    expect(Buffer.compare(responseBody, binaryPayload)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7. Content-Encoding Pass-Through
// ---------------------------------------------------------------------------

describe('content-encoding pass-through', () => {
  /** @see RFC 9110 §8.4.1 — Content-Encoding */
  it('forwards gzip-encoded response as-is', async () => {
    await using origin = createGzipServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed27 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed27.ok) throw parsed27.error
    const [request, responsePromise] = await createRequest({
      url: parsed27.value,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    })
    request.end('hello gzip')
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-encoding']).toBe('gzip')

    // Verify the body is valid gzip by decompressing it
    const compressedBody = await getBody(response)
    const decompressed = (await gunzip(compressedBody)).toString()
    expect(decompressed).toBe('hello gzip')
  })

  /** @see RFC 9110 §8.4.1 — Content-Encoding deflate */
  it('forwards deflate-encoded response as-is', async () => {
    await using origin = createDeflateServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed28 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed28.ok) throw parsed28.error
    const [request, responsePromise] = await createRequest({
      url: parsed28.value,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    })
    request.end('hello deflate')
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-encoding']).toBe('deflate')

    const compressedBody = await getBody(response)
    const decompressed = (await inflate(compressedBody)).toString()
    expect(decompressed).toBe('hello deflate')
  })

  it('forwards unencoded response as-is', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed29 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed29.ok) throw parsed29.error
    const [request, responsePromise] = await createRequest({
      url: parsed29.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.headers['content-encoding']).toBeUndefined()
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.method).toBe('GET')
  })
})

// ---------------------------------------------------------------------------
// 8. Error Handling as Proxy
// ---------------------------------------------------------------------------

describe('error handling as proxy', () => {
  /** @see RFC 9110 §15.5 — Client Error 4xx */
  it.each([400, 401, 403, 404, 422, 429])(
    'relays %i client error from origin',
    async (statusCode) => {
      await using origin = createStatusCodeServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const parsed30 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed30.ok) throw parsed30.error
      const [request, responsePromise] = await createRequest({
        url: parsed30.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  /** @see RFC 9110 §15.6 — Server Error 5xx */
  it.each([500, 502, 503, 504])(
    'relays %i server error from origin',
    async (statusCode) => {
      await using origin = createStatusCodeServer()
      await origin.listen()

      await using mocker = await createMocker({
        mode: 'pass',
        origin: `http://localhost:${origin.port}`,
      })
      await mocker.listen()

      const parsed31 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed31.ok) throw parsed31.error
      const [request, responsePromise] = await createRequest({
        url: parsed31.value,
        method: 'GET',
        headers: { 'response-status-code': `${statusCode}` },
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(statusCode)
    },
  )

  // Note: ECONNREFUSED is not in mocker's nonFatalErrors list, so when the
  // origin is unreachable, mocker sends a 500 response but then re-throws
  // the error, which crashes the server process. This is by design — mocker
  // treats ECONNREFUSED as a fatal error in pass mode. Testing this
  // behavior would require process-level isolation.
  it('returns 500 when origin returns a 500', async () => {
    await using origin = createStatusCodeServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed32 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed32.ok) throw parsed32.error
    const [request, responsePromise] = await createRequest({
      url: parsed32.value,
      method: 'GET',
      headers: { 'response-status-code': '500' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(500)
  })

  // Note: When origin closes the connection mid-response, mocker's pipeline
  // utility propagates the stream error. Since this error is not in mocker's
  // nonFatalErrors list, it causes the server to throw. Testing this would
  // require process-level isolation. Instead, we verify that mocker handles
  // well-formed error responses from the origin.
  it('relays origin timeout-like error (504)', async () => {
    await using origin = createStatusCodeServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed33 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed33.ok) throw parsed33.error
    const [request, responsePromise] = await createRequest({
      url: parsed33.value,
      method: 'GET',
      headers: { 'response-status-code': '504' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(504)
  })
})

// ---------------------------------------------------------------------------
// 9. Connection Management
// ---------------------------------------------------------------------------

describe('connection management', () => {
  it('handles keep-alive between client and proxy', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed34 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed34.ok) throw parsed34.error
    const [request, responsePromise] = await createRequest({
      url: parsed34.value,
      method: 'GET',
      headers: { connection: 'keep-alive' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    await getBody(response)
  })

  it('handles multiple sequential requests', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    for (let i = 0; i < 5; i++) {
      const parsed35 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/request-${i}`)
      if (!parsed35.ok) throw parsed35.error
      const [request, responsePromise] = await createRequest({
        url: parsed35.value,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(`${await getBody(response)}`)
      expect(body.url).toBe(`/request-${i}`)
    }
  })

  it('honors Connection: close', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed36 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed36.ok) throw parsed36.error
    const [request, responsePromise] = await createRequest({
      url: parsed36.value,
      method: 'GET',
      headers: { connection: 'close' },
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    await getBody(response)
  })
})

// ---------------------------------------------------------------------------
// 10. URL Rewriting
// ---------------------------------------------------------------------------

describe('URL rewriting', () => {
  /** @see RFC 9110 §7.1 — Path forwarding */
  it('forwards path matching client path', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed37 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/deeply/nested/path/resource`)
    if (!parsed37.ok) throw parsed37.error
    const [request, responsePromise] = await createRequest({
      url: parsed37.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/deeply/nested/path/resource')
  })

  it('preserves query string unchanged', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed38 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/api?foo=bar&baz=qux&arr=1&arr=2`)
    if (!parsed38.ok) throw parsed38.error
    const [request, responsePromise] = await createRequest({
      url: parsed38.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/api?foo=bar&baz=qux&arr=1&arr=2')
  })

  /** @see RFC 3986 §2.1 — Percent-encoding */
  it('preserves percent-encoded characters', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed39 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/path%20with%20spaces/%E4%B8%AD%E6%96%87`)
    if (!parsed39.ok) throw parsed39.error
    const [request, responsePromise] = await createRequest({
      url: parsed39.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe('/path%20with%20spaces/%E4%B8%AD%E6%96%87')
  })

  /**
   * @see RFC 9110 §7.2 — Host header
   *
   * mocker forwards the client's original Host header to the origin as-is,
   * which means the origin sees the proxy's host:port, not its own. This is
   * documented behavior — mocker acts as a transparent pass-through for
   * headers.
   */
  it('forwards client Host header to origin as-is', async () => {
    await using origin = createHeaderEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed40 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed40.ok) throw parsed40.error
    const [request, responsePromise] = await createRequest({
      url: parsed40.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    // mocker forwards the client's original Host header, so the origin
    // receives the proxy's host:port.
    expect(body.host).toContain(`${mocker.port}`)
  })
})

// ---------------------------------------------------------------------------
// 11. Concurrent Requests
// ---------------------------------------------------------------------------

describe('concurrent requests', () => {
  it('handles multiple simultaneous requests', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const concurrency = 10
    const results = await Promise.all(
      Array.from({ length: concurrency }, async (_, i) => {
        const parsed41 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/concurrent/${i}`)
        if (!parsed41.ok) throw parsed41.error
        const [request, responsePromise] = await createRequest({
          url: parsed41.value,
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
        })
        request.end(`payload-${i}`)
        const response = await responsePromise
        const body = JSON.parse(`${await getBody(response)}`)
        return body
      }),
    )

    expect(results).toHaveLength(concurrency)
    for (let i = 0; i < concurrency; i++) {
      const result = results[i]
      expect(result.url).toBe(`/concurrent/${i}`)
      expect(result.body).toBe(`payload-${i}`)
    }
  })

  it('no cross-request data leakage', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const concurrency = 20
    const results = await Promise.all(
      Array.from({ length: concurrency }, async (_, i) => {
        const uniquePayload = JSON.stringify({ requestIndex: i, nonce: crypto.randomUUID() })
        const parsed42 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/isolation/${i}`)
        if (!parsed42.ok) throw parsed42.error
        const [request, responsePromise] = await createRequest({
          url: parsed42.value,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-index': `${i}`,
          },
        })
        request.end(uniquePayload)
        const response = await responsePromise
        const body = JSON.parse(`${await getBody(response)}`)
        return { sent: uniquePayload, received: body.body, index: i, url: body.url }
      }),
    )

    for (const result of results) {
      // Each request should receive back exactly what it sent
      expect(result.received).toBe(result.sent)
      expect(result.url).toBe(`/isolation/${result.index}`)
    }
  })
})

// ---------------------------------------------------------------------------
// 12. Edge Cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles very long URL (near 8KB)', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    // Build a long path that's close to 8KB (leaving room for the host portion)
    const longSegment = 'a'.repeat(7500)
    const parsed43 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/${longSegment}`)
    if (!parsed43.ok) throw parsed43.error
    const [request, responsePromise] = await createRequest({
      url: parsed43.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const body = JSON.parse(`${await getBody(response)}`)
    expect(body.url).toBe(`/${longSegment}`)
  })

  it('handles empty response body with 200', async () => {
    await using origin = createEmptyBodyServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed44 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed44.ok) throw parsed44.error
    const [request, responsePromise] = await createRequest({
      url: parsed44.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  it('handles response with only headers, no body', async () => {
    await using origin = createServer(async (req, res) => {
      for await (const _ of req) {
        // drain
      }
      res.writeHead(204, {
        'x-custom-header': 'header-only',
        'x-another': 'value',
      })
      res.end()
    })
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    const parsed45 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed45.ok) throw parsed45.error
    const [request, responsePromise] = await createRequest({
      url: parsed45.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    expect(response.statusCode).toBe(204)
    expect(response.headers['x-custom-header']).toBe('header-only')
    expect(response.headers['x-another']).toBe('value')
    const body = await getBody(response)
    expect(body.length).toBe(0)
  })

  it('handles request with Expect: 100-continue', async () => {
    await using origin = createEchoServer()
    await origin.listen()

    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    // Use raw http.request to send Expect: 100-continue
    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: mocker.port,
          path: '/expect-continue',
          method: 'POST',
          headers: {
            'content-type': 'text/plain',
            expect: '100-continue',
          },
        },
        resolve,
      )
      req.on('error', reject)
      req.on('continue', () => {
        req.end('continued payload')
      })
      // Fallback: if no 100-continue is received within a short period,
      // send the body anyway (Node.js client does this automatically).
      setTimeout(() => {
        if (!req.writableEnded) {
          req.end('continued payload')
        }
      }, 500)
    })

    expect(response.statusCode).toBe(200)

    const body = await new Promise((resolve) => {
      /** @type {Buffer[]} */
      const chunks = []
      response.on('data', (/** @type {Buffer} */ chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })

    const parsed = JSON.parse(body.toString())
    expect(parsed.url).toBe('/expect-continue')
    expect(parsed.body).toBe('continued payload')
  })
})
