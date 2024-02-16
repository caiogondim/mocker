const getPort = require('get-port')
const { createMocker, createMemFs } = require('./helpers/mocker')
const { createServer: createTimeServer } = require('../../tools/time-server')
const { createRequest, getBody } = require('../shared/http')

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('args.update', () => {
  it('updates all mocks with origin in case update=startup', async () => {
    expect.assertions(2)

    // Creates origin server
    const originPort = await getPort()
    const timeServer = createTimeServer()
    await timeServer.listen(originPort)

    // Creates mocker server
    const { fs, responsesDir } = await createMemFs()
    const mockerPort = await getPort()
    const mocker1 = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
      fs,
      responsesDir,
    })
    await mocker1.listen()

    // First request to mocker to create a new mocked response
    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise
    const response1Body = `${await getBody(response1)}`

    await mocker1.close()

    // Sleeping so origin returns a new timestamp
    await sleep(100)

    // Create a new mocker instance with same file system as previous instance
    // and `update:'startup'`
    const mocker2 = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
      update: 'startup',
      fs,
      responsesDir,
    })
    await mocker2.listen()

    // Generates the same request to mocker. The response should come from a
    // mock and with an updated body due to `update: startup`
    const [request2, response2Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
    })
    request2.end()
    const response2 = await response2Promise
    const response2Body = `${await getBody(response2)}`

    try {
      expect(response2.headers['x-nyt-mocker-response-from']).toStrictEqual(
        'Mock'
      )
      expect(Number(response2Body)).toBeGreaterThanOrEqual(
        Number(response1Body)
      )
    } finally {
      await mocker2.close()
      await timeServer.close()
    }
  })

  it('updates all mocks with origin in case update=only', async () => {
    expect.assertions(1)

    // Given I have an origin server
    const originPort = await getPort()
    const timeServer = createTimeServer()
    await timeServer.listen(originPort)

    // And a mocker instance configured with `{ mode: 'write' }`
    const { fs, responsesDir } = await createMemFs()
    const mockerPort = await getPort()
    const mocker1 = await createMocker({
      port: mockerPort,
      mode: 'write',
      origin: `http://localhost:${originPort}`,
      fs,
      responsesDir,
    })
    await mocker1.listen()

    // And I create a request to mocker in order to generate a mocked response
    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise
    const response1Body = `${await getBody(response1)}`
    await mocker1.close()

    // And I wait a bit so origin returns a new timestamp
    await sleep(100)

    // When I create a new mocker instance with same file system as previous instance
    // and `update:'only'`
    const mocker2 = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
      update: 'only',
      fs,
      responsesDir,
    })
    await mocker2.listen()

    try {
      // Then it should update the mocked response on disk
      const files = await fs.promises.readdir(responsesDir)
      const fileContentBuffer = await fs.promises.readFile(
        `${responsesDir}/${files[0]}`
      )
      const fileContentJson = JSON.parse(fileContentBuffer.toString())
      const response2Body = fileContentJson.response.body

      expect(Number(response2Body)).toBeGreaterThanOrEqual(
        Number(response1Body)
      )
    } finally {
      await timeServer.close()
    }
  })

  it('terminates process after updating all mocks in case startup=only', async () => {
    expect.assertions(1)

    // Given I have an origin server
    const originPort = await getPort()
    const timeServer = createTimeServer()
    await timeServer.listen(originPort)

    // And I have a mocker instance configured with `{ update: 'only' }`
    const { fs, responsesDir } = await createMemFs()
    const mockerPort = await getPort()
    const mocker = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
      fs,
      responsesDir,
      update: 'only',
    })

    // When I start the mocker instance
    await mocker.listen()

    // And send a request to it
    async function createRequestThunk() {
      const [request1] = await createRequest({
        url: `http://localhost:${mockerPort}/`,
        method: 'GET',
      })
      request1.end()
    }

    try {
      // Then it should fail since `startup: 'only'` only updates all mocked
      // responses, and doesn't start the server.
      await expect(() => createRequestThunk()).rejects.toThrow(
        `connect ECONNREFUSED 127.0.0.1:${mockerPort}`
      )
    } finally {
      await timeServer.close()
    }
  })

  it.todo('preserves old mock in case origin doesnt return an HTTP 200')

  it.todo('preserves old mock in case there is an error while updating')

  it.todo('unredacts secrets on mocks before making a request to origin')

  it.todo(
    'doesnt update mock if it has a redacted secret that is not present on env'
  )

  it.todo('retries in case origin returns a non-200')
})
