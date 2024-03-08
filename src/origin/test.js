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
        overwriteRequestHeaders: { lorem: 'ipsum', dolor: 5, host: 'dolor' },
      })
      const [request, responsePromise] = await origin.request({ url: `/` })
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      try {
        expect(responseJson.host).toStrictEqual('dolor')
        expect(responseJson.lorem).toStrictEqual('ipsum')
        expect(responseJson.dolor).toStrictEqual('5')
      } finally {
        await requestHeaderOnResponseBodyServer.close()
      }
    })

    it(`removes \`via\` header request header if \`overwriteRequestHeaders\` equals to \`{ via: null }\``, async () => {
      expect.assertions(3)

      const originPort = await getPort()
      const requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen(originPort)

      const origin = new Origin({
        host: `http://localhost:${originPort}`,
        overwriteRequestHeaders: {
          host: 'example.com',
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
