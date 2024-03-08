const getPort = require('get-port')
const { createMocker } = require('./helpers/mocker')
const { createRequest, getBody } = require('../shared/http')
const { closeServer } = require('./helpers/async-http-server')
const { createServer: createTimeServer } = require('../../tools/time-server')

describe('health checks endpoints', () => {
  it('implements /.well-known/live endpoint for live health check', async () => {
    expect.assertions(2)

    // Given a mocker instance pointing to an origin that doesn't exist
    const origin =
      'https://non-existent-url-7bb5346fa5452600a876d24b98695404fa0c46ae.nytimes.com'
    const port = await getPort()
    const mocker = await createMocker({
      port,
      mode: 'pass',
      origin,
    })
    await mocker.listen()

    // When I fire a request to /.well-known/live
    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${port}/.well-known/live`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const responseBody = `${await getBody(response)}`

    try {
      // Then it should return HTTP 200
      expect(response.statusCode).toBe(200)
      // And an empty body
      expect(responseBody).toBe('')
    } finally {
      await closeServer(mocker)
    }
  })

  it('implements /.well-known/ready endpoint for ready health check', async () => {
    expect.assertions(2)

    // Given a mocker instance pointing to an origin that doesn't exist
    const origin =
      'https://non-existent-url-7bb5346fa5452600a876d24b98695404fa0c46ae.nytimes.com'
    const port = await getPort()
    const mocker = await createMocker({
      port,
      mode: 'pass',
      origin,
    })
    await mocker.listen()

    // When I fire a request to /.well-known/ready
    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${port}/.well-known/ready`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const responseBody = `${await getBody(response)}`

    try {
      // Then it should return HTTP 200
      expect(response.statusCode).toBe(200)
      // And an empty body
      expect(responseBody).toBe('')
    } finally {
      await closeServer(mocker)
    }
  })

  it('proxies other requests to /.well-known as a normal request', async () => {
    expect.assertions(2)

    // Given a simple HTTP server
    const originPort = await getPort()
    const origin = await createTimeServer()
    await origin.listen(originPort)

    // And a mocker instance pointing to it as origin
    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    // When I fire a request to any '/.well-known' URL
    // besides '/.well-known/live' or '/.well-known/ready'
    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mockerPort}/.well-known/availability`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const responseBody = `${await getBody(response)}`

    try {
      // Then it should behave normally proxying the request to origin.
      expect(response.statusCode).toBe(200)

      // And it should not have an empty response body, since the response comes
      // from origin.
      expect(responseBody).not.toBe('')
    } finally {
      await closeServer(mocker)
      await closeServer(origin)
    }
  })
})
