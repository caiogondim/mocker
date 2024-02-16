const getPort = require('get-port')
const { Origin } = require('.')
const { getBody } = require('../shared/http')
const {
  createServer: createRequestHeaderOnResponseBodyServer,
} = require('../../tools/request-header-on-response-body-server')
const { createServer: createFlakyServer } = require('../../tools/flaky-server')
const { createServer: createMathServer } = require('../../tools/math-server')

describe('origin', () => {
  describe('request()', () => {
    it('overwrites request headers defined on `overwriteRequestHeaders` constructor argument', async () => {
      expect.assertions(3)

      const originPort = await getPort()
      const requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen(originPort)

      const origin = new Origin({
        host: `http://localhost:${originPort}`,
        overwriteRequestHeaders: { host: null, lorem: 'ipsum', dolor: 5 },
      })
      const [request, responsePromise] = await origin.request({ url: `/` })
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      try {
        expect(responseJson.host).toBeUndefined()
        expect(responseJson.lorem).toStrictEqual('ipsum')
        expect(responseJson.dolor).toStrictEqual('5')
      } finally {
        await requestHeaderOnResponseBodyServer.close()
      }
    })

    // Node.js implicitly adds the `host` header to every request. We want to
    // remove this implicit behavior and create a request object with only
    // the arguments provided at runtime, and nothing more.
    it(`doesn't add any headers by default on request`, async () => {
      expect.assertions(1)

      // Given I have an object describing the headers on the request...

      const headers = { foo: 1, bar: 2 }
      const origin = new Origin({
        host: `https://nytimes.com`,
      })

      // When I make a request...

      const [request] = await origin.request({
        url: '/',
        headers,
      })
      try {
        // Then the request should contain only headers explicitly passed as
        // argument

        // eslint-disable-next-line jest/prefer-strict-equal
        expect(request.getHeaders()).toEqual(headers)
      } finally {
        request.abort()
      }
    })

    it(`removes \`via\` header request header if \`overwriteRequestHeaders\` equals to \`{ via: null }\``, async () => {
      expect.assertions(4)

      const originPort = await getPort()
      const requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen(originPort)

      const origin = new Origin({
        host: `http://localhost:${originPort}`,
        overwriteRequestHeaders: {
          host: null,
          lorem: 'ipsum',
          dolor: 5,
          via: null,
        },
      })
      const [request, responsePromise] = await origin.request({ url: `/` })
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      try {
        expect(responseJson.host).toBeUndefined()
        expect(responseJson.lorem).toStrictEqual('ipsum')
        expect(responseJson.dolor).toStrictEqual('5')
        expect(responseJson.via).toBeUndefined()
      } finally {
        await requestHeaderOnResponseBodyServer.close()
      }
    })

    it('retries requests as defined on `retries` constructor argument', async () => {
      expect.assertions(2)

      // This server always returns a 500 but on every 3rd request.
      const flakyServer = createFlakyServer()
      const originPort = await getPort()
      await flakyServer.listen(originPort)

      const origin = new Origin({
        host: `http://localhost:${originPort}`,
        retries: 3,
      })
      const [request, responsePromise] = await origin.request({
        url: `/`,
        method: 'POST',
      })
      request.write('lorem ipsum')
      request.write(' dolor')
      request.end(' sit amet')

      try {
        const response = await responsePromise
        expect(response.statusCode).toStrictEqual(200)

        const responseBody = await getBody(response)
        expect(responseBody.toString()).toStrictEqual(
          'lorem ipsum dolor sit amet'
        )
      } finally {
        await flakyServer.close()
      }
    })

    it('accepts absolute URLs', async () => {
      expect.assertions(2)

      // Given I have a server
      const mathServer = createMathServer()
      const originPort = await getPort()
      await mathServer.listen(originPort)

      // And a mocker server proxying it

      // When I make a request to the mocker server using an absolute URL
      const origin = new Origin({ host: `http://localhost:${originPort}` })
      const [request, responsePromise] = await origin.request({
        url: `http://localhost:${originPort}?a=1&b=2&operation=sum`,
      })
      request.end()

      // Then it should work as it does for relative URLs
      try {
        const response = await responsePromise
        expect(response.statusCode).toStrictEqual(200)

        const responseBody = await getBody(response)
        expect(responseBody.toString()).toStrictEqual('3')
      } finally {
        await mathServer.close()
      }
    })
  })
})
