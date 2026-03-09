import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import getPort from '../../src/__tests__/helpers/get-port.js'
import { createServer } from './index.js'
import { createRequest, getBody } from '../../src/shared/http/index.js'

describe('tools/math-server', () => {
  it('sums a and b query params if operation query param is equal to sum', async () => {
    const port = await getPort()
    const mathService = createServer()
    await mathService.listen(port)

    const [request1, responsePromise1] = await createRequest({
      url: `http://localhost:${port}/?a=1&b=3&operation=sum`,
    })
    request1.end()
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    assert.strictEqual(responseBody1, '4')

    const [request2, responsePromise2] = await createRequest({
      url: `http://localhost:${port}/?a=1000&b=3000&operation=sum`,
    })
    request2.end()
    const response2 = await responsePromise2
    const responseBody2 = (await getBody(response2)).toString()

    assert.strictEqual(responseBody2, '4000')

    await mathService.close()
  })

  it('multiplies a and b query params if operation query param is equal to multiply', async () => {
    const port = await getPort()
    const mathService = createServer()
    await mathService.listen(port)

    const [request1, responsePromise1] = await createRequest({
      url: `http://localhost:${port}/?a=7&b=9&operation=multiply`,
    })
    request1.end()
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    assert.strictEqual(responseBody1, '63')

    const [request2, responsePromise2] = await createRequest({
      url: `http://localhost:${port}/?a=1000&b=3000&operation=multiply`,
    })
    request2.end()
    const response2 = await responsePromise2
    const responseBody2 = (await getBody(response2)).toString()

    assert.strictEqual(responseBody2, '3000000')

    await mathService.close()
  })
})
