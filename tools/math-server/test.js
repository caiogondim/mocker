import { describe, it, expect } from '@jest/globals'
import { createServer } from './index.js'
import { createRequest, getBody } from '../../src/shared/http/index.js'

describe('tools/math-server', () => {
  it('sums a and b query params if operation query param is equal to sum', async () => {
    const mathService = createServer()
    await mathService.listen()

    const [request1, responsePromise1] = await createRequest({
      url: `http://localhost:${mathService.port}/?a=1&b=3&operation=sum`,
    })
    request1.end()
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    expect(responseBody1).toBe('4')

    const [request2, responsePromise2] = await createRequest({
      url: `http://localhost:${mathService.port}/?a=1000&b=3000&operation=sum`,
    })
    request2.end()
    const response2 = await responsePromise2
    const responseBody2 = (await getBody(response2)).toString()

    expect(responseBody2).toBe('4000')

    await mathService.close()
  })

  it('multiplies a and b query params if operation query param is equal to multiply', async () => {
    const mathService = createServer()
    await mathService.listen()

    const [request1, responsePromise1] = await createRequest({
      url: `http://localhost:${mathService.port}/?a=7&b=9&operation=multiply`,
    })
    request1.end()
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    expect(responseBody1).toBe('63')

    const [request2, responsePromise2] = await createRequest({
      url: `http://localhost:${mathService.port}/?a=1000&b=3000&operation=multiply`,
    })
    request2.end()
    const response2 = await responsePromise2
    const responseBody2 = (await getBody(response2)).toString()

    expect(responseBody2).toBe('3000000')

    await mathService.close()
  })
})
