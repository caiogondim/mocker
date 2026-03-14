import { describe, it, expect } from '@jest/globals'
import { createServer, createPayload } from './index.js'
import { createRequest, getBody } from '../../src/shared/http/index.js'
import { parse as parseAbsoluteHttpUrl } from '../../src/shared/absolute-http-url/index.js'

describe('duplicate-request-server', () => {
  it('responds with double the payload passed on request', async () => {
    // Configure server
    await using server = createServer()
    await server.listen()
    const serverUrl = `http://localhost:${server.port}`

    // Fire request
    const parsed1 = parseAbsoluteHttpUrl(serverUrl)
    if (!parsed1.ok) throw parsed1.error
    const __createRequestResult1 = await createRequest({
      url: parsed1.value,
      method: 'POST',
    })
    if (!__createRequestResult1.ok) throw __createRequestResult1.error
    const [request1, responsePromise1] = __createRequestResult1.value
    const payload = createPayload({ size: 1e6 }) // 1e6B = 1MB
    request1.end(payload)
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    expect(responseBody1).toBe(`${payload}${payload}`)
  })
})
