//
// Tests for HTTP proxy compliance: header forwarding, method forwarding,
// body integrity, status code relaying, and content-encoding pass-through.
//
// References:
// - RFC 7230 (HTTP/1.1 Message Syntax and Routing)
// - RFC 7231 (HTTP/1.1 Semantics and Content)
// - RFC 7239 (Forwarded HTTP Extension)
//

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import getPort from './helpers/get-port.js'
import { createMocker } from './helpers/mocker.js'
import { createServer as createHeaderEchoServer } from '../../tools/request-header-on-response-body-server/index.js'
import { createServer as createStatusCodeServer } from '../../tools/status-code-server/index.js'
import { createServer as createGzipServer } from '../../tools/gzip-server/index.js'
import { createRequest, getBody } from '../shared/http/index.js'

/**
 * Creates a server that echoes back the request method, url, headers, and body
 * as a JSON response.
 */
function createEchoServer() {
  const server = http.createServer(async (req, res) => {
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

  return {
    /** @param {number} port */
    listen(port) {
      return new Promise((resolve) => {
        server.listen(port, () => resolve(undefined))
      })
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)))
      })
    },
    get listening() {
      return server.listening
    },
  }
}

describe('proxy-headers', { concurrency: 1 }, () => {
describe('proxy headers', () => {
  /**
   * @see Spec https://tools.ietf.org/html/rfc7239
   * @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Forwarded
   */
  it(`'Forwarded' header`, async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          forwarded: 'for=192.0.2.60;proto=http;by=203.0.113.43',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.forwarded, 'for=192.0.2.60;proto=http;by=203.0.113.43')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For */
  it(`'X-Forwarded-For' header`, async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body['x-forwarded-for'], '203.0.113.195, 70.41.3.18')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host */
  it(`'X-Forwarded-Host' header`, async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          'x-forwarded-host': 'id42.example-cdn.com',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body['x-forwarded-host'], 'id42.example-cdn.com')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto */
  it(`'X-Forwarded-Proto' header`, async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          'x-forwarded-proto': 'https',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body['x-forwarded-proto'], 'https')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})

describe('HTTP method forwarding', () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
    it(`forwards ${method} method to origin`, async () => {
      const originPort = await getPort()
      const origin = createEchoServer()
      await origin.listen(originPort)

      const mockerPort = await getPort()
      const mocker = await createMocker({
        port: mockerPort,
        mode: 'pass',
        origin: `http://localhost:${originPort}`,
      })
      await mocker.listen()

      try {
        const [request, responsePromise] = await createRequest({
          url: `http://localhost:${mockerPort}/test-path`,
          method,
        })
        request.end()
        const response = await responsePromise
        const body = JSON.parse(`${await getBody(response)}`)
        assert.strictEqual(body.method, method)
      } finally {
        await mocker.close()
        await origin.close()
      }
    })
  }

  it('forwards HEAD method and returns no body', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'HEAD',
      })
      request.end()
      const response = await responsePromise
      assert.strictEqual(response.statusCode, 200)
      const body = await getBody(response)
      assert.strictEqual(body.length, 0)
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})

describe('request body integrity', () => {
  it('forwards JSON body intact', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    const payload = JSON.stringify({ key: 'value', nested: { a: 1 } })

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      request.end(payload)
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.body, payload)
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('forwards form-encoded body intact', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    const payload = 'username=admin&password=secret'

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
      request.end(payload)
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.body, payload)
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('forwards empty body on POST', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'POST',
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.body, '')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('forwards large body (>64KB)', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    const payload = 'x'.repeat(128 * 1024)

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
      })
      request.end(payload)
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.body, payload)
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})

describe('status code forwarding', () => {
  for (const statusCode of [200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503]) {
    it(`relays ${statusCode} status code from origin`, async () => {
      const originPort = await getPort()
      const origin = createStatusCodeServer()
      await origin.listen(originPort)

      const mockerPort = await getPort()
      const mocker = await createMocker({
        port: mockerPort,
        mode: 'pass',
        origin: `http://localhost:${originPort}`,
      })
      await mocker.listen()

      try {
        const [request, responsePromise] = await createRequest({
          url: `http://localhost:${mockerPort}/`,
          method: 'GET',
          headers: { 'response-status-code': `${statusCode}` },
        })
        request.end()
        const response = await responsePromise
        assert.strictEqual(response.statusCode, statusCode)
      } finally {
        await mocker.close()
        await origin.close()
      }
    })
  }
})

describe('end-to-end header forwarding', () => {
  it('forwards custom headers to origin', async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          'x-custom-header': 'custom-value',
          'x-request-id': 'abc-123-def',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body['x-custom-header'], 'custom-value')
      assert.strictEqual(body['x-request-id'], 'abc-123-def')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('forwards Accept header to origin', async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.accept, 'application/json')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('forwards Authorization header to origin', async () => {
    const originPort = await getPort()
    const origin = createHeaderEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.test',
        },
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.test')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})

describe('URL path and query string forwarding', () => {
  it('forwards path segments to origin', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/api/v2/users/42`,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.url, '/api/v2/users/42')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('forwards query string to origin', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/search?q=hello+world&page=2&limit=10`,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.url, '/search?q=hello+world&page=2&limit=10')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  it('preserves URL-encoded characters in path', async () => {
    const originPort = await getPort()
    const origin = createEchoServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/path%20with%20spaces/file%2Fname`,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise
      const body = JSON.parse(`${await getBody(response)}`)
      assert.strictEqual(body.url, '/path%20with%20spaces/file%2Fname')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})

describe('content-encoding pass-through', () => {
  it('forwards gzip-encoded response from origin', async () => {
    const originPort = await getPort()
    const origin = createGzipServer()
    await origin.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
      })
      request.end('hello gzip')
      const response = await responsePromise
      assert.strictEqual(response.statusCode, 200)
      assert.strictEqual(response.headers['content-encoding'], 'gzip')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})
})
