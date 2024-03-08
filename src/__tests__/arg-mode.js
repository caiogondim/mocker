const getPort = require('get-port')
const { createMocker, createMemFs } = require('./helpers/mocker')
const { closeServer, createServer } = require('./helpers/async-http-server')
const { createServer: createMathServer } = require('../../tools/math-server')
const { createServer: createTimeServer } = require('../../tools/time-server')
const { createRequest, getBody } = require('../shared/http')

describe(`mode = 'pass'`, () => {
  it('works as a pass-through proxy', async () => {
    expect.assertions(1)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'pass',
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=1&b=3&operation=sum`,
      })
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()

      expect(responseBody).toStrictEqual('4')
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })
})

describe(`mode = 'read-pass`, () => {
  it('returns a mocked response when `mode === "read-pass"` and there is a saved response for the request', async () => {
    expect.assertions(2)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'read-pass',
    })
    await mocker.listen()

    try {
      //
      // Normal flow: client <-> proxy <-> origin
      //

      const [request1, response1Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=5&b=9&operation=sum`,
      })
      request1.end()
      const response1 = await response1Promise
      const response1Body = (await getBody(response1)).toString()

      expect(response1Body).toStrictEqual('14')

      //
      // Mocked response: client <-> proxy
      //

      const [request2, response2Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=5&b=9&operation=sum`,
      })
      request2.end()
      const response2 = await response2Promise
      const response2Body = (await getBody(response2)).toString()

      expect(response2Body).toStrictEqual('14')
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })

  it('works as a pass-through proxy if `mode === "read-pass" and there is no saved response for the request`', async () => {
    expect.assertions(1)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'read-pass',
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=1&b=3&operation=sum`,
      })
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()

      expect(responseBody).toStrictEqual('4')
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })
})

describe(`mode = 'read-write`, () => {
  it('saves and returns a mocked response when `mode === "read-write"`', async () => {
    expect.assertions(2)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'read-write',
    })
    await mocker.listen()

    try {
      //
      // Normal flow: client <-> proxy <-> origin
      //

      const [request1, response1Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=2&b=5&operation=multiply`,
      })
      request1.end()

      const response1 = await response1Promise

      const response1Body = (await getBody(response1)).toString()

      expect(response1Body).toStrictEqual('10')

      // Turning off origin server to make sure proxy is returning a mocked response
      await mathServer.close()

      //
      // Mocked response: client <-> proxy
      //

      const [request2, response2Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=2&b=5&operation=multiply`,
      })
      request2.end()
      const response2 = await response2Promise
      const response2Body = (await getBody(response2)).toString()

      expect(response2Body).toStrictEqual('10')
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })

  it('returns a mocked response when there is a saved response for the request', async () => {
    expect.assertions(2)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'read-write',
    })
    await mocker.listen()

    try {
      //
      // Normal flow: client <-> proxy <-> origin
      //

      const [request1, response1Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=5&b=9&operation=sum`,
      })
      request1.end()
      const response1 = await response1Promise
      const response1Body = (await getBody(response1)).toString()

      expect(response1Body).toStrictEqual('14')

      //
      // Mocked response: client <-> proxy
      //

      const [request2, response2Promise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=5&b=9&operation=sum`,
      })
      request2.end()
      const response2 = await response2Promise
      const response2Body = (await getBody(response2)).toString()

      expect(response2Body).toStrictEqual('14')
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })
})

describe(`mode = 'read'`, () => {
  it('returns 404 when there is no saved response for the request', async () => {
    expect.assertions(1)

    const originPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(originPort)

    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'read',
    })
    await mocker.listen()

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/?a=34&b=35&operation=sum`,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise

      expect(response.statusCode).toStrictEqual(404)
    } finally {
      await closeServer(mocker)
      await closeServer(mathServer)
    }
  })
})

describe(`mode = 'pass-read'`, () => {
  it('fetches from origin first', async () => {
    expect.assertions(3)

    // Creates and starts origin server
    const originPort = await getPort()
    const originServer = await createTimeServer()
    await originServer.listen(originPort)

    // Creates and starts mocker server
    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'pass-read',
    })
    await mocker.listen()

    try {
      // All responses should come from origin as long as origin is available
      for (let i = 0; i < 3; i += 1) {
        const [request1, response1Promise] = await createRequest({
          url: `http://localhost:${mockerPort}/`,
          method: 'GET',
        })
        request1.end()
        const response1 = await response1Promise

        expect(`${i} ${response1.headers['x-nyt-mocker-response-from']}`).toBe(
          `${i} Origin`
        )
      }
    } finally {
      await closeServer(mocker)
      await closeServer(originServer)
    }
  })

  it('reads from a mocked response if origin is not available', async () => {
    expect.assertions(3)

    // Creates and starts origin server
    const originPort = await getPort()
    const originServer = await createTimeServer()
    await originServer.listen(originPort)

    // Creates a shared `responsesDir` and `fs`. We will first populate `fs`
    // in a mocker instance with `mode: 'write'` and then reuse the same `fs`
    // in another instance with `mode: 'pass-read'`
    const { responsesDir, fs } = await createMemFs()

    // Creates and starts mocker server with `mode: 'write'` to populate
    // `fs` with a mocked response
    const mocker1Port = await getPort()
    const mocker1 = await createMocker({
      port: mocker1Port,
      origin: `http://localhost:${originPort}`,
      mode: 'write',
      responsesDir,
      fs,
    })
    await mocker1.listen()

    // Creates and starts mocker server with `mode: 'pass-read'` using an
    // already populated `fs`
    const mocker2Port = await getPort()
    const mocker2 = await createMocker({
      port: mocker2Port,
      origin: `http://localhost:${originPort}`,
      mode: 'pass-read',
      responsesDir,
      fs,
    })
    await mocker2.listen()

    try {
      // Fires request to `mocker1` in order to populate `fs` with a mocked response
      const [request1, response1Promise] = await createRequest({
        url: `http://localhost:${mocker1Port}/`,
        method: 'GET',
      })
      request1.end()
      const response1 = await response1Promise

      expect(response1.headers['x-nyt-mocker-response-from']).toBe(`Origin`)

      // Now we fire a request to `mocker2` with `mode: 'pass-read` to confirm
      // it is getting a response from origin
      const [request2, response2Promise] = await createRequest({
        url: `http://localhost:${mocker2Port}/`,
        method: 'GET',
      })
      request2.end()
      const response2 = await response2Promise

      expect(response2.headers['x-nyt-mocker-response-from']).toBe(`Origin`)

      // Turning off the origin server to test a request without origin being available
      await closeServer(originServer)

      // Fires a request to `mocker2` with origin not available. It should
      // return a mocked response.
      const [request3, response3Promise] = await createRequest({
        url: `http://localhost:${mocker2Port}/`,
        method: 'GET',
      })
      request3.end()
      const response3 = await response3Promise

      expect(response3.headers['x-nyt-mocker-response-from']).toBe(`Mock`)
    } finally {
      await closeServer(mocker1)
      await closeServer(mocker2)
      await closeServer(originServer)
    }
  })

  it('reads from a mocked response if origin returns a 500', async () => {
    expect.assertions(3)

    // Creates and starts origin server
    const originPort = await getPort()
    let shouldOriginReturn500 = false
    const originServer = createServer(async (req, res) => {
      const statusCode = shouldOriginReturn500 ? 500 : 200
      res.writeHead(statusCode, {})
      res.end()
    })
    await originServer.listen(originPort)

    // Creates a shared `responsesDir` and `fs`. We will first populate `fs`
    // in a mocker instance with `mode: 'write'` and then reuse the same `fs`
    // in another instance with `mode: 'pass-read'`
    const { responsesDir, fs } = await createMemFs()

    // Creates and starts mocker server with `mode: 'write'` to populate
    // `fs` with a mocked response
    const mocker1Port = await getPort()
    const mocker1 = await createMocker({
      port: mocker1Port,
      origin: `http://localhost:${originPort}`,
      mode: 'write',
      responsesDir,
      fs,
    })
    await mocker1.listen()

    // Creates and starts mocker server with `mode: 'pass-read'` using an
    // already populated `fs`
    const mocker2Port = await getPort()
    const mocker2 = await createMocker({
      port: mocker2Port,
      origin: `http://localhost:${originPort}`,
      mode: 'pass-read',
      responsesDir,
      fs,
    })
    await mocker2.listen()

    try {
      // Fires request to `mocker1` in order to populate `fs` with a mocked response
      const [request1, response1Promise] = await createRequest({
        url: `http://localhost:${mocker1Port}/`,
        method: 'GET',
      })
      request1.end()
      const response1 = await response1Promise

      expect(response1.headers['x-nyt-mocker-response-from']).toBe(`Origin`)

      // Now we fire a request to `mocker2` with `mode: 'pass-read` to confirm
      // it is getting a response from origin
      const [request2, response2Promise] = await createRequest({
        url: `http://localhost:${mocker2Port}/`,
        method: 'GET',
      })
      request2.end()
      const response2 = await response2Promise

      expect(response2.headers['x-nyt-mocker-response-from']).toBe(`Origin`)

      // Forcing origin to return 500
      shouldOriginReturn500 = true

      // Fires a request to `mocker2` with origin returning 500. It should
      // return a mocked response.
      const [request3, response3Promise] = await createRequest({
        url: `http://localhost:${mocker2Port}/`,
        method: 'GET',
      })
      request3.end()
      const response3 = await response3Promise

      expect(response3.headers['x-nyt-mocker-response-from']).toBe(`Mock`)
    } finally {
      await closeServer(mocker1)
      await closeServer(mocker2)
      await closeServer(originServer)
    }
  })

  it('returns 404 if origin is not available and there is no mocked response for the request', async () => {
    expect.assertions(2)

    // We reserve a port for origin, but we don't listen for anything on this port.
    const originPort = await getPort()

    // Creates and starts a mocker instance
    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      origin: `http://localhost:${originPort}`,
      mode: 'pass-read',
    })
    await mocker.listen()

    try {
      // Fires a request to a mocker instance without an available origin and
      // without mocks
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
      })
      request.end()
      const response = await responsePromise

      expect(response.statusCode).toBe(404)
      expect(response.headers['x-nyt-mocker-mock-path']).toBe(`Not Found`)
    } finally {
      await closeServer(mocker)
    }
  })
})
