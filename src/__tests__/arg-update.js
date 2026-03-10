import { describe, it, expect } from '@jest/globals'
import getPort from './helpers/get-port.js'
import { createMocker, createMemFs } from './helpers/mocker.js'
import { createServer as createTimeServer } from '../../tools/time-server/index.js'
import { createServer as createStatusCodeServer } from '../../tools/status-code-server/index.js'
import { createServer as createFlakyServer } from '../../tools/flaky-server/index.js'
import { createServer as createHeaderEchoServer } from '../../tools/request-header-on-response-body-server/index.js'
import { createRequest, getBody } from '../shared/http/index.js'
import sleep from '../shared/sleep/index.js'

describe('args.update', () => {
  it('updates all mocks with origin in case update=startup', async () => {
    // Creates origin server
    const originPort = await getPort()
    await using timeServer = createTimeServer()
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
    await using mocker2 = await createMocker({
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

    expect(response2.headers['x-mocker-response-from']).toBe('Mock')
    expect(Number(response2Body)).toBeGreaterThanOrEqual(Number(response1Body))
  })

  it('updates all mocks with origin in case update=only', async () => {
    // Given I have an origin server
    const originPort = await getPort()
    await using timeServer = createTimeServer()
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
    await using mocker2 = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
      update: 'only',
      fs,
      responsesDir,
    })
    await mocker2.listen()

    // Then it should update the mocked response on disk
    const files = await fs.promises.readdir(responsesDir)
    const fileContentBuffer = await fs.promises.readFile(
      `${responsesDir}/${files[0]}`,
    )
    const fileContentJson = JSON.parse(fileContentBuffer.toString())
    const response2Body = fileContentJson.response.body

    expect(Number(response2Body)).toBeGreaterThanOrEqual(Number(response1Body))
  })

  it('terminates process after updating all mocks in case startup=only', async () => {
    // Given I have an origin server
    const originPort = await getPort()
    await using timeServer = createTimeServer()
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

    // Then it should fail since `startup: 'only'` only updates all mocked
    // responses, and doesn't start the server.
    await expect(() => createRequestThunk()).rejects.toThrow()
  })

  it('preserves old mock in case origin doesnt return an HTTP 200', async () => {
    // Create origin that returns 200
    const originPort = await getPort()
    await using timeServer = createTimeServer()
    await timeServer.listen(originPort)

    // Create mocker and generate a mock
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

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Read the mock content before update
    const files = await fs.promises.readdir(responsesDir)
    const mockBefore = (
      await fs.promises.readFile(`${responsesDir}/${files[0]}`)
    ).toString()

    // Start a new origin that returns 404 on a different port
    await timeServer.close()
    const originPort2 = await getPort()
    await using statusCodeServer = createStatusCodeServer()
    await statusCodeServer.listen(originPort2)

    // Start mocker with update:'startup' — origin returns 404, mock should be preserved
    const mockerPort2 = await getPort()
    await using mocker2 = await createMocker({
      port: mockerPort2,
      mode: 'read-write',
      origin: `http://localhost:${originPort2}`,
      update: 'startup',
      fs,
      responsesDir,
    })
    await mocker2.listen()

    const mockAfter = (
      await fs.promises.readFile(`${responsesDir}/${files[0]}`)
    ).toString()
    expect(mockAfter).toBe(mockBefore)
  })

  it('preserves old mock in case there is an error while updating', async () => {
    // Create origin and generate a mock
    const originPort = await getPort()
    await using timeServer = createTimeServer()
    await timeServer.listen(originPort)

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

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Read mock content before update
    const files = await fs.promises.readdir(responsesDir)
    const mockBefore = (
      await fs.promises.readFile(`${responsesDir}/${files[0]}`)
    ).toString()

    // Shut down origin so update fails with a connection error
    await timeServer.close()

    // Point to a port with nothing listening — connection will be refused
    const deadPort = await getPort()

    // Start mocker with update:'startup' — origin is down, mock should be preserved
    const mockerPort2 = await getPort()
    await using mocker2 = await createMocker({
      port: mockerPort2,
      mode: 'read-write',
      origin: `http://localhost:${deadPort}`,
      update: 'startup',
      fs,
      responsesDir,
    })
    await mocker2.listen()

    const mockAfter = (
      await fs.promises.readFile(`${responsesDir}/${files[0]}`)
    ).toString()
    expect(mockAfter).toBe(mockBefore)
  })

  it('unredacts secrets on mocks before making a request to origin', async () => {
    // Use header echo server as origin — it returns request headers as JSON body
    const originPort = await getPort()
    await using headerEchoServer = createHeaderEchoServer()
    await headerEchoServer.listen(originPort)

    // Create mocker with redactedHeaders so the secret header gets redacted on disk
    const { fs, responsesDir } = await createMemFs()
    const mockerPort = await getPort()
    const mocker1 = await createMocker({
      port: mockerPort,
      mode: 'write',
      origin: `http://localhost:${originPort}`,
      fs,
      responsesDir,
      redactedHeaders: { authorization: 'Bearer secret-token' },
    })
    await mocker1.listen()

    // Make a request with the secret header
    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
      headers: { authorization: 'Bearer secret-token' },
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Verify the mock on disk has the header redacted
    const files = await fs.promises.readdir(responsesDir)
    const mockContent = JSON.parse(
      (await fs.promises.readFile(`${responsesDir}/${files[0]}`)).toString(),
    )
    expect(mockContent.request.headers.authorization).toBe('[REDACTED]')
    await headerEchoServer.close()
  })

  it('doesnt update mock if it has a redacted secret that is not present on env', async () => {
    // Use header echo server as origin
    const originPort = await getPort()
    await using headerEchoServer = createHeaderEchoServer()
    await headerEchoServer.listen(originPort)

    // Create mocker with redactedHeaders to generate a mock with redacted secrets
    const { fs, responsesDir } = await createMemFs()
    const mockerPort = await getPort()
    const mocker1 = await createMocker({
      port: mockerPort,
      mode: 'write',
      origin: `http://localhost:${originPort}`,
      fs,
      responsesDir,
      redactedHeaders: { authorization: 'Bearer secret-token' },
    })
    await mocker1.listen()

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
      headers: { authorization: 'Bearer secret-token' },
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Read mock before update
    const files = await fs.promises.readdir(responsesDir)
    const mockBefore = (
      await fs.promises.readFile(`${responsesDir}/${files[0]}`)
    ).toString()

    // Start mocker with update:'startup' but WITHOUT providing the redacted secret
    // This should trigger SecretNotFoundError and preserve the mock
    await using mocker2 = await createMocker({
      port: mockerPort,
      mode: 'read-write',
      origin: `http://localhost:${originPort}`,
      update: 'startup',
      fs,
      responsesDir,
      redactedHeaders: {},
    })
    await mocker2.listen()

    const mockAfter = (
      await fs.promises.readFile(`${responsesDir}/${files[0]}`)
    ).toString()
    expect(mockAfter).toBe(mockBefore)
  })

  it('retries in case origin returns a non-200', async () => {
    // Flaky server returns 200 on every 3rd request, 500 otherwise
    const originPort = await getPort()
    await using flakyServer = createFlakyServer()
    await flakyServer.listen(originPort)

    // Create mocker with retries=3 so it will eventually get a 200
    const { fs, responsesDir } = await createMemFs()
    const mockerPort = await getPort()
    await using mocker = await createMocker({
      port: mockerPort,
      mode: 'write',
      origin: `http://localhost:${originPort}`,
      fs,
      responsesDir,
      retries: 3,
    })
    await mocker.listen()

    const [request1, response1Promise] = await createRequest({
      url: `http://localhost:${mockerPort}/`,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    // The flaky server returns 200 on the 3rd request, so with retries
    // the mocker should eventually get a successful response
    expect(response1.statusCode).toBe(200)
  })
})
