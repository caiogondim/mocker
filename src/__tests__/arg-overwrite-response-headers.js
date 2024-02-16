const getPort = require('get-port')
const { createRequest } = require('../shared/http')
const { createServer: createMathServer } = require('../../tools/math-server')
const { closeServer } = require('./helpers/async-http-server')
const { createMocker } = require('./helpers/mocker')

describe('args.overwriteResponseHeaders', () => {
  it('overwrites headers from response coming directly from origin', async () => {
    expect.assertions(1)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const contentType = 'text/lorem-ipsum'
    const overwriteResponseHeaders = { 'content-type': contentType }
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'pass',
      overwriteResponseHeaders,
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/?a=34&b=35&operation=sum`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    try {
      expect(response1.headers['content-type']).toStrictEqual(contentType)
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })

  it('removes header if it has a value of `null`', async () => {
    expect.assertions(1)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    // Creates a 'pass' mocker instance with `overwriteResponseHeaders`
    // arg set to remove 'content-type' header.
    const mockerPort = await getPort()
    const overwriteResponseHeaders = { 'content-type': null }
    const mocker = await createMocker({
      mode: 'pass',
      overwriteResponseHeaders,
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    // Fires a request to mocker.
    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/?a=34&b=35&operation=sum`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    try {
      // 'content-type' header should not be present.
      expect(response1.headers['content-type']).toBeUndefined()
    } finally {
      await closeServer(mathServer)
      await closeServer(mocker)
    }
  })

  it('overwrites headers from response coming from a mock', async () => {
    expect.assertions(4)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const contentType = 'text/lorem-ipsum'
    const overwriteResponseHeaders = { 'content-type': contentType }
    const mocker = await createMocker({
      overwriteResponseHeaders,
      mode: 'read-write',
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
    })
    await mocker.listen()

    try {
      //
      // Normal flow: client <-> proxy <-> origin
      //

      const [request1, response1Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=34&b=35&operation=sum`,
        method: 'GET',
      })
      request1.end()
      const response1 = await response1Promise

      expect(response1.headers['content-type']).toStrictEqual(contentType)
      expect(response1.headers['x-nyt-mocker-response-from']).toStrictEqual(
        'Origin'
      )

      //
      // Mocked response: client <-> proxy
      //

      const [request2, response2Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=34&b=35&operation=sum`,
        method: 'GET',
      })
      request2.end()
      const response2 = await response2Promise

      expect(response2.headers['content-type']).toStrictEqual(contentType)
      expect(response2.headers['x-nyt-mocker-response-from']).toStrictEqual(
        'Mock'
      )
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })
})
