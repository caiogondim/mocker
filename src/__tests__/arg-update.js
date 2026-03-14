import { describe, it, expect } from '@jest/globals'
import { createMocker, createMemFs } from './helpers/mocker.js'
import { createServer as createTimeServer } from '../../tools/time-server/index.js'
import { createServer as createStatusCodeServer } from '../../tools/status-code-server/index.js'
import { createServer as createFlakyServer } from '../../tools/flaky-server/index.js'
import { createServer as createHeaderEchoServer } from '../../tools/request-header-on-response-body-server/index.js'
import { createRequest, getBody } from '../shared/http/index.js'
import { setTimeout as sleep } from 'node:timers/promises'
import { parse as parseAbsoluteHttpUrl } from '../shared/absolute-http-url/index.js'

describe('args.update', () => {
  it('updates all mocks with origin in case update=startup', async () => {
    // Creates origin server
    await using timeServer = createTimeServer()
    await timeServer.listen()

    // Creates mocker server
    const { fs, mocksDir } = await createMemFs()
    await using mocker1 = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${timeServer.port}`,
      fs,
      mocksDir,
    })
    await mocker1.listen()

    // First request to mocker to create a new mocked response
    const parsed1 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed1.ok) throw parsed1.error
    const [request1, response1Promise] = await createRequest({
      url: parsed1.value,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise
    const response1Body = `${await getBody(response1)}`

    await mocker1.close()

    // Sleeping so origin returns a new timestamp
    await sleep(10)

    // Create a new mocker instance with same file system as previous instance
    // and `update:'startup'`
    await using mocker2 = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${timeServer.port}`,
      update: 'startup',
      fs,
      mocksDir,
    })
    await mocker2.listen()

    // Generates the same request to mocker. The response should come from a
    // mock and with an updated body due to `update: startup`
    const parsed2 = parseAbsoluteHttpUrl(`http://localhost:${mocker2.port}/`)
    if (!parsed2.ok) throw parsed2.error
    const [request2, response2Promise] = await createRequest({
      url: parsed2.value,
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
    await using timeServer = createTimeServer()
    await timeServer.listen()

    // And a mocker instance configured with `{ mode: 'write' }`
    const { fs, mocksDir } = await createMemFs()
    await using mocker1 = await createMocker({
      mode: 'write',
      origin: `http://localhost:${timeServer.port}`,
      fs,
      mocksDir,
    })
    await mocker1.listen()

    // And I create a request to mocker in order to generate a mocked response
    const parsed3 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed3.ok) throw parsed3.error
    const [request1, response1Promise] = await createRequest({
      url: parsed3.value,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise
    const response1Body = `${await getBody(response1)}`
    await mocker1.close()

    // And I wait a bit so origin returns a new timestamp
    await sleep(10)

    // When I create a new mocker instance with same file system as previous instance
    // and `update:'only'`
    await using mocker2 = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${timeServer.port}`,
      update: 'only',
      fs,
      mocksDir,
    })
    await mocker2.listen()

    // Then it should update the mocked response on disk
    const files = await fs.promises.readdir(mocksDir)
    const fileContentBuffer = await fs.promises.readFile(
      `${mocksDir}/${files[0]}`,
    )
    const fileContentJson = JSON.parse(fileContentBuffer.toString())
    const response2Body = fileContentJson.response.body

    expect(Number(response2Body)).toBeGreaterThanOrEqual(Number(response1Body))
  })

  it('terminates process after updating all mocks in case startup=only', async () => {
    // Given I have an origin server
    await using timeServer = createTimeServer()
    await timeServer.listen()

    // And I have a mocker instance configured with `{ update: 'only' }`
    const { fs, mocksDir } = await createMemFs()
    const mocker = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${timeServer.port}`,
      fs,
      mocksDir,
      update: 'only',
    })

    // When I start the mocker instance
    await mocker.listen()

    // And send a request to it
    async function createRequestThunk() {
      const parsed4 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
      if (!parsed4.ok) throw parsed4.error
      const [request1] = await createRequest({
        url: parsed4.value,
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
    await using timeServer = createTimeServer()
    await timeServer.listen()

    // Create mocker and generate a mock
    const { fs, mocksDir } = await createMemFs()
    await using mocker1 = await createMocker({
      mode: 'write',
      origin: `http://localhost:${timeServer.port}`,
      fs,
      mocksDir,
    })
    await mocker1.listen()

    const parsed5 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed5.ok) throw parsed5.error
    const [request1, response1Promise] = await createRequest({
      url: parsed5.value,
      method: 'GET',
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Read the mock content before update
    const files = await fs.promises.readdir(mocksDir)
    const mockBefore = (
      await fs.promises.readFile(`${mocksDir}/${files[0]}`)
    ).toString()

    // Start a new origin that returns 404 on a different port
    await timeServer.close()
    await using statusCodeServer = createStatusCodeServer()
    await statusCodeServer.listen()

    // Start mocker with update:'startup' — origin returns 404, mock should be preserved
    await using mocker2 = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${statusCodeServer.port}`,
      update: 'startup',
      fs,
      mocksDir,
    })
    await mocker2.listen()

    const mockAfter = (
      await fs.promises.readFile(`${mocksDir}/${files[0]}`)
    ).toString()
    expect(mockAfter).toBe(mockBefore)
  })

  it('preserves old mock in case there is an error while updating', async () => {
    // Create origin and generate a mock
    await using timeServer = createTimeServer()
    await timeServer.listen()

    const { fs, mocksDir } = await createMemFs()
    await using mocker1 = await createMocker({
      mode: 'write',
      origin: `http://localhost:${timeServer.port}`,
      fs,
      mocksDir,
    })
    await mocker1.listen()

    const parsed6 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed6.ok) throw parsed6.error
    const [request1, response1Promise] = await createRequest({
      url: parsed6.value,
      method: 'GET',
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Read mock content before update
    const files = await fs.promises.readdir(mocksDir)
    const mockBefore = (
      await fs.promises.readFile(`${mocksDir}/${files[0]}`)
    ).toString()

    // Shut down origin so update fails with a connection error
    await timeServer.close()

    // Point to the closed server's port — connection will be refused
    // Start mocker with update:'startup' — origin is down, mock should be preserved
    await using mocker2 = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${timeServer.port}`,
      update: 'startup',
      fs,
      mocksDir,
    })
    await mocker2.listen()

    const mockAfter = (
      await fs.promises.readFile(`${mocksDir}/${files[0]}`)
    ).toString()
    expect(mockAfter).toBe(mockBefore)
  })

  it('unredacts secrets on mocks before making a request to origin', async () => {
    // Use header echo server as origin — it returns request headers as JSON body
    await using headerEchoServer = createHeaderEchoServer()
    await headerEchoServer.listen()

    // Create mocker with redactedHeaders so the secret header gets redacted on disk
    const { fs, mocksDir } = await createMemFs()
    await using mocker1 = await createMocker({
      mode: 'write',
      origin: `http://localhost:${headerEchoServer.port}`,
      fs,
      mocksDir,
      redactedHeaders: { authorization: 'Bearer secret-token' },
    })
    await mocker1.listen()

    // Make a request with the secret header
    const parsed7 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed7.ok) throw parsed7.error
    const [request1, response1Promise] = await createRequest({
      url: parsed7.value,
      method: 'GET',
      headers: { authorization: 'Bearer secret-token' },
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Verify the mock on disk has the header redacted
    const files = await fs.promises.readdir(mocksDir)
    const mockContent = JSON.parse(
      (await fs.promises.readFile(`${mocksDir}/${files[0]}`)).toString(),
    )
    expect(mockContent.request.headers.authorization).toBe('[REDACTED]')
    await headerEchoServer.close()
  })

  it('doesnt update mock if it has a redacted secret that is not present on env', async () => {
    // Use header echo server as origin
    await using headerEchoServer = createHeaderEchoServer()
    await headerEchoServer.listen()

    // Create mocker with redactedHeaders to generate a mock with redacted secrets
    const { fs, mocksDir } = await createMemFs()
    await using mocker1 = await createMocker({
      mode: 'write',
      origin: `http://localhost:${headerEchoServer.port}`,
      fs,
      mocksDir,
      redactedHeaders: { authorization: 'Bearer secret-token' },
    })
    await mocker1.listen()

    const parsed8 = parseAbsoluteHttpUrl(`http://localhost:${mocker1.port}/`)
    if (!parsed8.ok) throw parsed8.error
    const [request1, response1Promise] = await createRequest({
      url: parsed8.value,
      method: 'GET',
      headers: { authorization: 'Bearer secret-token' },
    })
    request1.end()
    await response1Promise
    await mocker1.close()

    // Read mock before update
    const files = await fs.promises.readdir(mocksDir)
    const mockBefore = (
      await fs.promises.readFile(`${mocksDir}/${files[0]}`)
    ).toString()

    // Start mocker with update:'startup' but WITHOUT providing the redacted secret
    // This should trigger SecretNotFoundError and preserve the mock
    await using mocker2 = await createMocker({
      mode: 'read-write',
      origin: `http://localhost:${headerEchoServer.port}`,
      update: 'startup',
      fs,
      mocksDir,
      redactedHeaders: {},
    })
    await mocker2.listen()

    const mockAfter = (
      await fs.promises.readFile(`${mocksDir}/${files[0]}`)
    ).toString()
    expect(mockAfter).toBe(mockBefore)
  })

  it('retries in case origin returns a non-200', async () => {
    // Flaky server returns 200 on every 3rd request, 500 otherwise
    await using flakyServer = createFlakyServer()
    await flakyServer.listen()

    // Create mocker with retries=3 so it will eventually get a 200
    const { fs, mocksDir } = await createMemFs()
    await using mocker = await createMocker({
      mode: 'write',
      origin: `http://localhost:${flakyServer.port}`,
      fs,
      mocksDir,
      retries: 3,
    })
    await mocker.listen()

    const parsed9 = parseAbsoluteHttpUrl(`http://localhost:${mocker.port}/`)
    if (!parsed9.ok) throw parsed9.error
    const [request1, response1Promise] = await createRequest({
      url: parsed9.value,
      method: 'GET',
    })
    request1.end()
    const response1 = await response1Promise

    // The flaky server returns 200 on the 3rd request, so with retries
    // the mocker should eventually get a successful response
    expect(response1.statusCode).toBe(200)
  })
})
