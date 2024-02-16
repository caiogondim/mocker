const { PassThrough } = require('stream')
const getPort = require('get-port')
const tee = require('.')
const { createRequest, getBody } = require('../../http')
const {
  createServer: createMathServer,
} = require('../../../../tools/math-server')
const {
  createServer: createDuplicateRequestServer,
  createPayload,
} = require('../../../../tools/duplicate-request-server')

jest.setTimeout(30000)

describe('tee', () => {
  it('clones an HTTP response stream with all properties', async () => {
    expect.hasAssertions()

    // Math server
    const mathServerPort = await getPort()
    const mathServer = createMathServer()
    await mathServer.listen(mathServerPort)
    const mathServerUrl = `http://localhost:${mathServerPort}`

    const [request, responsePromise] = await createRequest({
      url: mathServerUrl,
      method: 'POST',
    })
    const requestBody = JSON.stringify({
      a: 1,
      b: 2,
      operation: 'sum',
    })
    request.write(requestBody)
    request.end()
    const response = await responsePromise
    const [response1, response2] = tee(response)
    const response1Body = (await getBody(response1)).toString()
    const response2Body = (await getBody(response2)).toString()

    try {
      expect(response1Body).toStrictEqual('3')
      expect(response2Body).toStrictEqual('3')

      for (const prop of Object.keys(response)) {
        expect(prop in response1).toStrictEqual(true)
        expect(prop in response2).toStrictEqual(true)
      }
    } finally {
      await mathServer.close()
    }
  })

  it('clones a readable stream', async () => {
    expect.assertions(2)

    const passThrough = new PassThrough()
    const [clone1, clone2] = tee(passThrough)

    passThrough.write('1')
    passThrough.write('2')
    passThrough.write('3')
    passThrough.end()

    const clone1Contents = (await getBody(clone1)).toString()
    const clone2Contents = (await getBody(clone2)).toString()

    expect(clone1Contents).toStrictEqual('123')
    expect(clone2Contents).toStrictEqual('123')
  })

  // This avoid a problem when `duplicated1` would not consume `source` until the
  // end if `duplicated2` wasn't reading from source as well.
  it('duplicated1 stream should consume source to the end even if duplicated2 doesnt consume source', async () => {
    expect.assertions(2)

    const duplicateRequestServer = createDuplicateRequestServer()
    const port = await getPort()
    await duplicateRequestServer.listen(port)

    try {
      // Prepare a 10MB payload
      const reqBody = createPayload({ size: 1e7 })

      // Send the 10MB payload
      const [request, responsePromise] = await createRequest({
        url: `http://localhost:${port}`,
        method: 'POST',
      })
      request.end(reqBody)
      const response = await responsePromise
      const [response1, response2] = tee(response)
      const response1Body = (await getBody(response1)).toString()

      // Response should be the request payload * 2
      expect(response1Body).toStrictEqual(`${reqBody}${reqBody}`)

      // `response2` should be able to consume `response` until the end even after
      // `response1` consuming it entirely
      const response2Body = (await getBody(response2)).toString()

      expect(response2Body).toStrictEqual(`${reqBody}${reqBody}`)
    } finally {
      await duplicateRequestServer.close()
    }
  })
})
