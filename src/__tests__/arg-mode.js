import { describe, it, expect } from '@jest/globals'
import { createMocker, createMemFs } from './helpers/mocker.js'
import { createServer } from './helpers/async-http-server.js'
import { createServer as createMathServer } from '../../tools/math-server/index.js'
import { createServer as createTimeServer } from '../../tools/time-server/index.js'
import { createRequest, getBody } from '../shared/http/index.js'
import { parse as parseAbsoluteHttpUrl } from '../shared/absolute-http-url/index.js'

describe(`mode = 'pass'`, () => {
  it('works as a pass-through proxy', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    await using mocker = await createMocker({
      origin: `http://localhost:${mathServer.port}`,
      mode: 'pass',
    })
    await mocker.listen()

    const parsed1 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=1&b=3&operation=sum`)
    if (!parsed1.ok) throw parsed1.error
    const [request, responsePromise] = await createRequest({
      url: parsed1.value,
    })
    request.end()
    const response = await responsePromise
    const responseBody = (await getBody(response)).toString()

    expect(responseBody).toBe('4')
  })
})

describe(`mode = 'read-pass`, () => {
  it('returns a mocked response when `mode === "read-pass"` and there is a saved response for the request', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    await using mocker = await createMocker({
      origin: `http://localhost:${mathServer.port}`,
      mode: 'read-pass',
    })
    await mocker.listen()

    //
    // Normal flow: client <-> proxy <-> origin
    //

    const parsed2 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=5&b=9&operation=sum`)
    if (!parsed2.ok) throw parsed2.error
    const [request1, response1Promise] = await createRequest({
      url: parsed2.value,
    })
    request1.end()
    const response1 = await response1Promise
    const response1Body = (await getBody(response1)).toString()

    expect(response1Body).toBe('14')

    //
    // Mocked response: client <-> proxy
    //

    const parsed3 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=5&b=9&operation=sum`)
    if (!parsed3.ok) throw parsed3.error
    const [request2, response2Promise] = await createRequest({
      url: parsed3.value,
    })
    request2.end()
    const response2 = await response2Promise
    const response2Body = (await getBody(response2)).toString()

    expect(response2Body).toBe('14')
  })

  it('works as a pass-through proxy if `mode === "read-pass" and there is no saved response for the request`', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    await using mocker = await createMocker({
      origin: `http://localhost:${mathServer.port}`,
      mode: 'read-pass',
    })
    await mocker.listen()

    const parsed4 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=1&b=3&operation=sum`)
    if (!parsed4.ok) throw parsed4.error
    const [request, responsePromise] = await createRequest({
      url: parsed4.value,
    })
    request.end()
    const response = await responsePromise
    const responseBody = (await getBody(response)).toString()

    expect(responseBody).toBe('4')
  })
})

describe(`mode = 'read-write`, () => {
  it('saves and returns a mocked response when `mode === "read-write"`', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    await using mocker = await createMocker({
      origin: `http://localhost:${mathServer.port}`,
      mode: 'read-write',
    })
    await mocker.listen()

    //
    // Normal flow: client <-> proxy <-> origin
    //

    const parsed5 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=2&b=5&operation=multiply`)
    if (!parsed5.ok) throw parsed5.error
    const [request1, response1Promise] = await createRequest({
      url: parsed5.value,
    })
    request1.end()

    const response1 = await response1Promise

    const response1Body = (await getBody(response1)).toString()

    expect(response1Body).toBe('10')

    // Turning off origin server to make sure proxy is returning a mocked response
    await mathServer.close()

    //
    // Mocked response: client <-> proxy
    //

    const parsed6 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=2&b=5&operation=multiply`)
    if (!parsed6.ok) throw parsed6.error
    const [request2, response2Promise] = await createRequest({
      url: parsed6.value,
    })
    request2.end()
    const response2 = await response2Promise
    const response2Body = (await getBody(response2)).toString()

    expect(response2Body).toBe('10')
  })

  it('returns a mocked response when there is a saved response for the request', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    await using mocker = await createMocker({
      origin: `http://localhost:${mathServer.port}`,
      mode: 'read-write',
    })
    await mocker.listen()

    //
    // Normal flow: client <-> proxy <-> origin
    //

    const parsed7 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=5&b=9&operation=sum`)
    if (!parsed7.ok) throw parsed7.error
    const [request1, response1Promise] = await createRequest({
      url: parsed7.value,
    })
    request1.end()
    const response1 = await response1Promise
    const response1Body = (await getBody(response1)).toString()

    expect(response1Body).toBe('14')

    //
    // Mocked response: client <-> proxy
    //

    const parsed8 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=5&b=9&operation=sum`)
    if (!parsed8.ok) throw parsed8.error
    const [request2, response2Promise] = await createRequest({
      url: parsed8.value,
    })
    request2.end()
    const response2 = await response2Promise
    const response2Body = (await getBody(response2)).toString()

    expect(response2Body).toBe('14')
  })
})

describe(`mode = 'read'`, () => {
  it('returns 404 when there is no saved response for the request', async () => {
    await using mathServer = createMathServer()
    await mathServer.listen()

    await using mocker = await createMocker({
      origin: `http://localhost:${mathServer.port}`,
      mode: 'read',
    })
    await mocker.listen()

    const parsed9 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/?a=34&b=35&operation=sum`)
    if (!parsed9.ok) throw parsed9.error
    const [request, responsePromise] = await createRequest({
      url: parsed9.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise

    expect(response.statusCode).toBe(404)
  })
})

describe(`mode = 'pass-read'`, () => {
  it('fetches from origin first', async () => {
    // Creates and starts origin server
    await using originServer = createTimeServer()
    await originServer.listen()

    // Creates and starts mocker server
    await using mocker = await createMocker({
      origin: `http://localhost:${originServer.port}`,
      mode: 'pass-read',
    })
    await mocker.listen()

    // All responses should come from origin as long as origin is available
    for (let i = 0; i < 3; i += 1) {
      const parsed10 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed10.ok) throw parsed10.error
      const [request1, response1Promise] = await createRequest({
        url: parsed10.value,
        method: 'GET',
      })
      request1.end()
      const response1 = await response1Promise

      expect(`${i} ${response1.headers['x-mocker-response-from']}`).toBe(
        `${i} Origin`,
      )
    }
  })

  it('reads from a mocked response if origin is not available', async () => {
    // Creates and starts origin server
    await using originServer = createTimeServer()
    await originServer.listen()

    // Creates a shared `responsesDir` and `fs`. We will first populate `fs`
    // in a mocker instance with `mode: 'write'` and then reuse the same `fs`
    // in another instance with `mode: 'pass-read'`
    const { responsesDir, fs } = await createMemFs()

    // Creates and starts mocker server with `mode: 'write'` to populate
    // `fs` with a mocked response
    await using mocker1 = await createMocker({
      origin: `http://localhost:${originServer.port}`,
      mode: 'write',
      responsesDir,
      fs,
    })
    await mocker1.listen()

    // Creates and starts mocker server with `mode: 'pass-read'` using an
    // already populated `fs`
    await using mocker2 = await createMocker({
      origin: `http://localhost:${originServer.port}`,
      mode: 'pass-read',
      responsesDir,
      fs,
    })
    await mocker2.listen()

    // Fires request to `mocker1` in order to populate `fs` with a mocked response
    const parsed11 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed11.ok) throw parsed11.error
    const [request1, response1Promise] = await createRequest({
      url: parsed11.value,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    expect(response1.headers['x-mocker-response-from']).toBe(`Origin`)

    // Now we fire a request to `mocker2` with `mode: 'pass-read` to confirm
    // it is getting a response from origin
    const parsed12 = parseAbsoluteHttpUrl(`http://localhost:${mocker2.port}/`)
    if (!parsed12.ok) throw parsed12.error
    const [request2, response2Promise] = await createRequest({
      url: parsed12.value,
      method: 'GET',
    })
    request2.end()
    const response2 = await response2Promise

    expect(response2.headers['x-mocker-response-from']).toBe(`Origin`)

    // Turning off the origin server to test a request without origin being available
    await originServer.close()

    // Fires a request to `mocker2` with origin not available. It should
    // return a mocked response.
    const parsed13 = parseAbsoluteHttpUrl(`http://localhost:${mocker2.port}/`)
    if (!parsed13.ok) throw parsed13.error
    const [request3, response3Promise] = await createRequest({
      url: parsed13.value,
      method: 'GET',
    })
    request3.end()
    const response3 = await response3Promise

    expect(response3.headers['x-mocker-response-from']).toBe(`Mock`)
  })

  it('reads from a mocked response if origin returns a 500', async () => {
    // Creates and starts origin server
    let shouldOriginReturn500 = false
    await using originServer = createServer(async (req, res) => {
      const statusCode = shouldOriginReturn500 ? 500 : 200
      res.writeHead(statusCode, {})
      res.end()
    })
    await originServer.listen()

    // Creates a shared `responsesDir` and `fs`. We will first populate `fs`
    // in a mocker instance with `mode: 'write'` and then reuse the same `fs`
    // in another instance with `mode: 'pass-read'`
    const { responsesDir, fs } = await createMemFs()

    // Creates and starts mocker server with `mode: 'write'` to populate
    // `fs` with a mocked response
    await using mocker1 = await createMocker({
      origin: `http://localhost:${originServer.port}`,
      mode: 'write',
      responsesDir,
      fs,
    })
    await mocker1.listen()

    // Creates and starts mocker server with `mode: 'pass-read'` using an
    // already populated `fs`
    await using mocker2 = await createMocker({
      origin: `http://localhost:${originServer.port}`,
      mode: 'pass-read',
      responsesDir,
      fs,
    })
    await mocker2.listen()

    // Fires request to `mocker1` in order to populate `fs` with a mocked response
    const parsed14 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed14.ok) throw parsed14.error
    const [request1, response1Promise] = await createRequest({
      url: parsed14.value,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    expect(response1.headers['x-mocker-response-from']).toBe(`Origin`)

    // Now we fire a request to `mocker2` with `mode: 'pass-read` to confirm
    // it is getting a response from origin
    const parsed15 = parseAbsoluteHttpUrl(`http://localhost:${mocker2.port}/`)
    if (!parsed15.ok) throw parsed15.error
    const [request2, response2Promise] = await createRequest({
      url: parsed15.value,
      method: 'GET',
    })
    request2.end()
    const response2 = await response2Promise

    expect(response2.headers['x-mocker-response-from']).toBe(`Origin`)

    // Forcing origin to return 500
    shouldOriginReturn500 = true

    // Fires a request to `mocker2` with origin returning 500. It should
    // return a mocked response.
    const parsed16 = parseAbsoluteHttpUrl(`http://localhost:${mocker2.port}/`)
    if (!parsed16.ok) throw parsed16.error
    const [request3, response3Promise] = await createRequest({
      url: parsed16.value,
      method: 'GET',
    })
    request3.end()
    const response3 = await response3Promise

    expect(response3.headers['x-mocker-response-from']).toBe(`Mock`)
  })

  it('returns 404 if origin is not available and there is no mocked response for the request', async () => {
    // We use a port where nothing is listening to simulate an unavailable origin.
    // Port 1 is virtually guaranteed to be unavailable.
    await using mocker = await createMocker({
      origin: `http://localhost:1`,
      mode: 'pass-read',
    })
    await mocker.listen()

    // Fires a request to a mocker instance without an available origin and
    // without mocks
    const parsed17 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed17.ok) throw parsed17.error
    const [request, responsePromise] = await createRequest({
      url: parsed17.value,
      method: 'GET',
    })
    request.end()
    const response = await responsePromise

    expect(response.statusCode).toBe(404)
    expect(response.headers['x-mocker-mock-path']).toBe(`Not Found`)
  })
})
