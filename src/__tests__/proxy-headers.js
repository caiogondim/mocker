//
// Tests for all spec'd and de-facto headers a proxy should honor.
//

import getPort from 'get-port'
import { createMocker } from './helpers/mocker.js'
import { createServer as createHeaderEchoServer } from '../../tools/request-header-on-response-body-server/index.js'
import { createRequest, getBody } from '../shared/http/index.js'

describe('proxy headers', () => {
  /**
   * @see Spec https://tools.ietf.org/html/rfc7239
   * @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Forwarded
   */
  it(`'Forwarded' header`, async () => {
    expect.assertions(1)

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
      expect(body.forwarded).toBe('for=192.0.2.60;proto=http;by=203.0.113.43')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For */
  it(`'X-Forwarded-For' header`, async () => {
    expect.assertions(1)

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
      expect(body['x-forwarded-for']).toBe('203.0.113.195, 70.41.3.18')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Host */
  it(`'X-Forwarded-Host' header`, async () => {
    expect.assertions(1)

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
      expect(body['x-forwarded-host']).toBe('id42.example-cdn.com')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })

  /** @see Docs https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto */
  it(`'X-Forwarded-Proto' header`, async () => {
    expect.assertions(1)

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
      expect(body['x-forwarded-proto']).toBe('https')
    } finally {
      await mocker.close()
      await origin.close()
    }
  })
})
