import { PassThrough } from 'node:stream'
import type { Headers } from '../shared/http/types.js'
import { HTTP_METHOD } from '../shared/http-method/index.js'
import type { HttpMethod } from '../shared/types.js'

class MockedRequest extends PassThrough {
  readonly headers: Headers
  readonly method: HttpMethod
  readonly url: string

  constructor({
    url,
    method = HTTP_METHOD.GET,
    headers = {},
  }: {
    url: string
    headers?: Headers
    method?: HttpMethod
  }) {
    super()

    this.headers = headers

    this.method = method

    this.url = url
  }
}

export default MockedRequest
