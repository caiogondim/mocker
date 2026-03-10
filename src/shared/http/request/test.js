import { describe, it, expect, jest } from '@jest/globals'
import getPort from '../../../__tests__/helpers/get-port.js'
import { createServer as createDuplicateRequestServer } from '../../../../tools/duplicate-request-server/index.js'
import { createServer as createFlakyServer } from '../../../../tools/flaky-server/index.js'
import createBackoff from '../../backoff/index.js'
import { setTimeout as sleep } from 'node:timers/promises'
import { getBody } from '../index.js'
import createRequest from './index.js'

describe('createRequest', () => {
  it('makes a request and receives a response', async () => {
    await using duplicateRequestServer = createDuplicateRequestServer()
    const port = await getPort()
    await duplicateRequestServer.listen(port)

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${port}`,
      method: 'POST',
    })
    request.write('lorem ipsum')
    request.end()

    const response = await responsePromise

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('lorem ipsumlorem ipsum')
  })

  it('throws an error in case a connection cannot be made', async () => {
    const port = await getPort()

    await expect(
      createRequest({
        url: `http://localhost:${port}`,
      }),
    ).rejects.toThrow()
  })

  it('retries up to `retries`', async () => {
    await using flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    //
    // Even though flaky server returns a successful response on the
    // 3rd attempt, `createRequest` abstracts that.
    //

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${port}`,
      method: 'POST',
      retries: 3,
      backoff: async () => {},
    })
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(200)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('dolor sit amet')
  })

  it('returns the last non-successful request if number of tries equals to `retries`', async () => {
    await using flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${port}`,
      method: 'POST',
      retries: 2,
      backoff: async () => {},
    })
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    const response = await responsePromise
    expect(response.statusCode).toBe(500)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('')
  })

  it('backs off between retries', async () => {
    await using flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    const mockBackoff = jest.fn()

    const [request, responsePromise] = await createRequest({
      url: `http://localhost:${port}`,
      method: 'POST',
      retries: 3,
      backoff: mockBackoff,
    })
    request.write('dolor')
    request.write(' sit amet')
    request.end()

    await responsePromise

    expect(mockBackoff.mock.calls.length).toBe(2)
  })

  // Regression test
  it('retries even if server cannot be reached', async () => {
    const port = await getPort()
    await using flakyServer = createFlakyServer()

    async function sendRequest() {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${port}`,
        method: 'POST',
        retries: 5,
        backoff: createBackoff({ initial: 10 }),
      })
      request.write('dolor')
      request.write(' sit amet')
      request.end()

      return responsePromise
    }

    async function startServerAfterDelay() {
      await sleep(10)
      await flakyServer.listen(port)
    }

    // Run `sendRequest` and `startServerAfterDelay` in parallel.
    // Server will be started after the first request was sent.
    const [responsePromise] = await Promise.all([
      sendRequest(),
      startServerAfterDelay(),
    ])

    const response = await responsePromise
    expect(response.statusCode).toBe(200)

    const responseBody = await getBody(response)
    expect(responseBody.toString()).toBe('dolor sit amet')
  })
})
