import type { Headers } from '../../../shared/http/types.js'
import { HTTP_METHOD } from '../../../shared/http-method/index.js'
import type { HttpMethod } from '../../../shared/types.js'
import MockedRequest from '../../mocked-request.js'

function createMockedRequest(
  opts: { url?: string; headers?: Headers; method?: HttpMethod } = {},
) {
  const defaults = {
    url: 'http://example.com',
    method: HTTP_METHOD.GET,
  }

  return new MockedRequest({ ...defaults, ...opts })
}

export { createMockedRequest }
