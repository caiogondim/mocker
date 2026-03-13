import { describe, it, expect } from '@jest/globals'
import { createRequest } from '../shared/http/index.js'
import { createServer as createMathServer } from '../../tools/math-server/index.js'
import { createMocker } from './helpers/mocker.js'

describe('args.overwriteResponseHeaders', () => {
  it('overwrites headers from response coming directly from origin', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    const contentType = 'text/lorem-ipsum'
    const overwriteResponseHeaders = { 'content-type': contentType }
    await using mocker = await createMocker({
      mode: 'pass',
      overwriteResponseHeaders,
      origin: `http://localhost:${mathServer.port}`,
    })
    await mocker.listen()

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mocker.port}/?a=34&b=35&operation=sum`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    expect(response1.headers['content-type']).toEqual(contentType)
  })

  it('removes header if it has a value of `null`', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    // Creates a 'pass' mocker instance with `overwriteResponseHeaders`
    // arg set to remove 'content-type' header.
    const overwriteResponseHeaders = { 'content-type': null }
    await using mocker = await createMocker({
      mode: 'pass',
      overwriteResponseHeaders,
      origin: `http://localhost:${mathServer.port}`,
    })
    await mocker.listen()

    // Fires a request to mocker.
    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mocker.port}/?a=34&b=35&operation=sum`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    // 'content-type' header should not be present.
    expect(response1.headers['content-type']).toBeUndefined()
  })

  it('overwrites headers from response coming from a mock', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    const contentType = 'text/lorem-ipsum'
    const overwriteResponseHeaders = { 'content-type': contentType }
    await using mocker = await createMocker({
      overwriteResponseHeaders,
      mode: 'read-write',
      origin: `http://localhost:${mathServer.port}`,
    })
    await mocker.listen()

    //
    // Normal flow: client <-> proxy <-> origin
    //

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mocker.port}/?a=34&b=35&operation=sum`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    expect(response1.headers['content-type']).toEqual(contentType)
    expect(response1.headers['x-mocker-response-from']).toBe('Origin')

    //
    // Mocked response: client <-> proxy
    //

    const [request2, response2Promise] = await createRequest({
      url: `http://localhost:${mocker.port}/?a=34&b=35&operation=sum`,
      method: 'GET',
    })
    request2.end()
    const response2 = await response2Promise

    expect(response2.headers['content-type']).toEqual(contentType)
    expect(response2.headers['x-mocker-response-from']).toBe('Mock')
  })
})
