const getPort = require('get-port')
const { createServer, createPayload } = require('.')
const { createRequest, getBody } = require('../../src/shared/http')

describe('duplicate-request-server', () => {
  it('responds with double the payload passed on request', async () => {
    expect.assertions(1)

    // Configure server
    const port = await getPort()
    const server = createServer()
    await server.listen(port)
    const serverUrl = `http://localhost:${port}`

    // Fire request
    const [request1, responsePromise1] = await createRequest({
      url: serverUrl,
      method: 'POST',
    })
    const payload = createPayload({ size: 1e6 }) // 1e6B = 1MB
    request1.end(payload)
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    try {
      expect(responseBody1).toStrictEqual(`${payload}${payload}`)
    } finally {
      await server.close()
    }
  })
})
