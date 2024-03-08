const getPort = require('get-port')
const {
  createServer: createDuplicateRequestServer,
} = require('../../../../tools/duplicate-request-server')
const {
  createServer: createFlakyServer,
} = require('../../../../tools/flaky-server')
const createBackoff = require('../../backoff')
const sleep = require('../../sleep')
const { getBody } = require('..')
const createRequest = require('.')

describe('createRequest', () => {
  it('makes a request and receives a response', async () => {
    expect.assertions(1)

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
      expect(responseBody.toString()).toBe('lorem ipsumlorem ipsum')
    } finally {
      duplicateRequestServer.close()
    }
  })

  it('throws an error in case a connection cannot be made', async () => {
    expect.assertions(1)

    const port = await getPort()

    await expect(
      createRequest({
        url: `http://localhost:${port}`,
      })
    ).rejects.toThrow(``)
  })

  it('retries up to `retries`', async () => {
    expect.assertions(2)

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
      expect(response.statusCode).toBe(200)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('dolor sit amet')
    } finally {
      flakyServer.close()
    }
  })

  it('returns the last non-successful request if number of tries equals to `retries`', async () => {
    expect.assertions(2)

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
      expect(response.statusCode).toBe(500)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('')
    } finally {
      flakyServer.close()
    }
  })

  it('backs off between retries', async () => {
    expect.assertions(1)

    const flakyServer = createFlakyServer()
    const port = await getPort()
    await flakyServer.listen(port)

    const mockBackoff = jest.fn()

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

      expect(mockBackoff).toHaveBeenCalledTimes(2)
    } finally {
      flakyServer.close()
    }
  })

  // Regression test
  it('retries even if server cannot be reached', async () => {
    expect.assertions(2)

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
      expect(response.statusCode).toBe(200)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('dolor sit amet')
    } finally {
      flakyServer.close()
    }
  })
})
