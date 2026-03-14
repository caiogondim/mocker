/** @typedef {import('../args/types.js').HttpUrl} HttpUrl */
/** @typedef {import('../args/types.js').NonNegativeInteger} NonNegativeInteger */

import { describe, it, expect } from '@jest/globals'
import { createOrigin } from './index.js'
import { getBody } from '../shared/http/index.js'
import { createServer as createRequestHeaderOnResponseBodyServer } from '../../tools/request-header-on-response-body-server/index.js'
import { createServer as createFlakyServer } from '../../tools/flaky-server/index.js'
import { createServer as createMathServer } from '../../tools/math-server/index.js'

describe('origin', () => {
  describe('request()', () => {
    it('overwrites request headers defined on `overwriteRequestHeaders` constructor argument', async () => {
      await using requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen()

      const origin = createOrigin({
        host: /** @type {HttpUrl} */ (
          `http://localhost:${requestHeaderOnResponseBodyServer.port}`
        ),
        overwriteRequestHeaders: { lorem: 'ipsum', dolor: 5, host: 'dolor' },
      })
      const result = await origin.request({ url: `/` })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      expect(responseJson.host).toBe('dolor')
      expect(responseJson.lorem).toBe('ipsum')
      expect(responseJson.dolor).toBe('5')
    })

    it(`removes \`via\` header request header if \`overwriteRequestHeaders\` equals to \`{ via: null }\``, async () => {
      await using requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen()

      const origin = createOrigin({
        host: /** @type {HttpUrl} */ (
          `http://localhost:${requestHeaderOnResponseBodyServer.port}`
        ),
        overwriteRequestHeaders: {
          host: 'example.com',
          lorem: 'ipsum',
          dolor: 5,
          via: null,
        },
      })
      const result = await origin.request({ url: `/` })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      expect(responseJson.lorem).toBe('ipsum')
      expect(responseJson.dolor).toBe('5')
      expect(responseJson.via).toBeUndefined()
    })

    it('retries requests as defined on `retries` constructor argument', async () => {
      // This server always returns a 500 but on every 3rd request.
      await using flakyServer = createFlakyServer()
      await flakyServer.listen()

      const origin = createOrigin({
        host: /** @type {HttpUrl} */ (`http://localhost:${flakyServer.port}`),
        retries: /** @type {NonNegativeInteger} */ (3),
      })
      const result = await origin.request({
        url: `/`,
        method: 'POST',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.write('lorem ipsum')
      request.write(' dolor')
      request.end(' sit amet')

      const response = await responsePromise
      expect(response.statusCode).toBe(200)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('lorem ipsum dolor sit amet')
    })

    it('accepts absolute URLs', async () => {
      // Given I have a server
      await using mathServer = createMathServer()
      await mathServer.listen()

      // And a mocker server proxying it

      // When I make a request to the mocker server using an absolute URL
      const origin = createOrigin({
        host: /** @type {HttpUrl} */ (`http://localhost:${mathServer.port}`),
      })
      const result = await origin.request({
        url: `http://localhost:${mathServer.port}?a=1&b=2&operation=sum`,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()

      // Then it should work as it does for relative URLs
      const response = await responsePromise
      expect(response.statusCode).toBe(200)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('3')
    })
  })
})
