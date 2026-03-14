import { describe, it, expect } from '@jest/globals'
import { createServer } from './index.js'
import { createRequest, getBody } from '../../src/shared/http/index.js'
import { parse as parseAbsoluteHttpUrl } from '../../src/shared/absolute-http-url/index.js'

describe('tools/math-server', () => {
  it('sums a and b query params if operation query param is equal to sum', async () => {
    const mathService = createServer()
    await mathService.listen()

    const parsed1 = parseAbsoluteHttpUrl(
      `http://localhost:${mathService.port}/?a=1&b=3&operation=sum`,
    )
    if (!parsed1.ok) throw parsed1.error
    const [request1, responsePromise1] = await createRequest({
      url: parsed1.value,
    })
    request1.end()
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    expect(responseBody1).toBe('4')

    const parsed2 = parseAbsoluteHttpUrl(
      `http://localhost:${mathService.port}/?a=1000&b=3000&operation=sum`,
    )
    if (!parsed2.ok) throw parsed2.error
    const [request2, responsePromise2] = await createRequest({
      url: parsed2.value,
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

    const parsed3 = parseAbsoluteHttpUrl(
      `http://localhost:${mathService.port}/?a=7&b=9&operation=multiply`,
    )
    if (!parsed3.ok) throw parsed3.error
    const [request1, responsePromise1] = await createRequest({
      url: parsed3.value,
    })
    request1.end()
    const response1 = await responsePromise1
    const responseBody1 = (await getBody(response1)).toString()

    expect(responseBody1).toBe('63')

    const parsed4 = parseAbsoluteHttpUrl(
      `http://localhost:${mathService.port}/?a=1000&b=3000&operation=multiply`,
    )
    if (!parsed4.ok) throw parsed4.error
    const [request2, responsePromise2] = await createRequest({
      url: parsed4.value,
    })
    request2.end()
    const response2 = await responsePromise2
    const responseBody2 = (await getBody(response2)).toString()

    expect(responseBody2).toBe('3000000')

    await mathService.close()
  })
})
