import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import getPort from '../../../__tests__/helpers/get-port.js'
import { createServer as createDuplicateRequestServer } from '../../../../tools/duplicate-request-server/index.js'
import { createServer as createFlakyServer } from '../../../../tools/flaky-server/index.js'
import createBackoff from '../../backoff/index.js'
import sleep from '../../sleep/index.js'
import { getBody } from '../index.js'
import createRequest from './index.js'

describe('createRequest', () => {
  it('makes a request and receives a response', async () => {
    const duplicateRequestServer = createDuplicateRequestServer()
    const port = await getPort()
    await duplicateRequestServer.listen(port)

    try {
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${port}`,
        method: 'POST',
      })
      request.write('lorem ipsum')
      request.end()

      const response = await responsePromise

      const responseBody = await getBody(response)
      assert.strictEqual(responseBody.toString(), 'lorem ipsumlorem ipsum')
    } finally {
      duplicateRequestServer.close()
    }
  })

  it('throws an error in case a connection cannot be made', async () => {
    const port = await getPort()

    await assert.rejects(
      createRequest({
        url: `http://localhost:${port}`,
      }),
    )
  })

  it('retries up to `retries`', async () => {
    const flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    try {
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
      assert.strictEqual(response.statusCode, 200)

      const responseBody = await getBody(response)
      assert.strictEqual(responseBody.toString(), 'dolor sit amet')
    } finally {
      flakyServer.close()
    }
  })

  it('returns the last non-successful request if number of tries equals to `retries`', async () => {
    const flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    try {
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
      assert.strictEqual(response.statusCode, 500)

      const responseBody = await getBody(response)
      assert.strictEqual(responseBody.toString(), '')
    } finally {
      flakyServer.close()
    }
  })

  it('backs off between retries', async () => {
    const flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    const mockBackoff = mock.fn()

    try {
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

      assert.strictEqual(mockBackoff.mock.calls.length, 2)
    } finally {
      flakyServer.close()
    }
  })

  // Regression test
  it('retries even if server cannot be reached', async () => {
    const port = await getPort()
    const flakyServer = createFlakyServer()

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

    try {
      // Run `sendRequest` and `startServerAfterDelay` in parallel.
      // Server will be started after the first request was sent.
      const [responsePromise] = await Promise.all([
        sendRequest(),
        startServerAfterDelay(),
      ])

      const response = await responsePromise
      assert.strictEqual(response.statusCode, 200)

      const responseBody = await getBody(response)
      assert.strictEqual(responseBody.toString(), 'dolor sit amet')
    } finally {
      flakyServer.close()
    }
  })
})
