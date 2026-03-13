import { describe, it, expect } from '@jest/globals'
import { createMocker } from './helpers/mocker.js'
import { createRequest, getBody } from '../shared/http/index.js'
import { createServer as createTimeServer } from '../../tools/time-server/index.js'

describe('health checks endpoints', () => {
  it('implements /.well-known/live endpoint for live health check', async () => {
    // Given a mocker instance pointing to an origin that doesn't exist
    const origin =
      'https://non-existent-url-7bb5346fa5452600a876d24b98695404fa0c46ae.example.com'
    await using mocker = await createMocker({
      mode: 'pass',
      origin,
    })
    await mocker.listen()

    // When I fire a request to /.well-known/live
    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/.well-known/live`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const responseBody = `${await getBody(response)}`

    // Then it should return HTTP 200
    expect(response.statusCode).toBe(200)
    // And an empty body
    expect(responseBody).toBe('')
  })

  it('implements /.well-known/ready endpoint for ready health check', async () => {
    // Given a mocker instance pointing to an origin that doesn't exist
    const origin =
      'https://non-existent-url-7bb5346fa5452600a876d24b98695404fa0c46ae.example.com'
    await using mocker = await createMocker({
      mode: 'pass',
      origin,
    })
    await mocker.listen()

    // When I fire a request to /.well-known/ready
    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/.well-known/ready`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const responseBody = `${await getBody(response)}`

    // Then it should return HTTP 200
    expect(response.statusCode).toBe(200)
    // And an empty body
    expect(responseBody).toBe('')
  })

  it('proxies other requests to /.well-known as a normal request', async () => {
    // Given a simple HTTP server
    await using origin = createTimeServer()
    await origin.listen()

    // And a mocker instance pointing to it as origin
    await using mocker = await createMocker({
      mode: 'pass',
      origin: `http://localhost:${origin.port}`,
    })
    await mocker.listen()

    // When I fire a request to any '/.well-known' URL
    // besides '/.well-known/live' or '/.well-known/ready'
    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${mocker.port}/.well-known/availability`,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise
    const responseBody = `${await getBody(response)}`

    // Then it should behave normally proxying the request to origin.
    expect(response.statusCode).toBe(200)

    // And it should not have an empty response body, since the response comes
    // from origin.
    expect(responseBody).not.toBe('')
  })
})
