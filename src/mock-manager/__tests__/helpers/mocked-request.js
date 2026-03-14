import MockedRequest from '../../mocked-request.js'
import { HTTP_METHOD } from '../../../shared/http-method/index.js'

function createMockedRequest(opts = {}) {
  const defaults = {
    url: 'http://example.com',
    method: HTTP_METHOD.GET,
  }

  return new MockedRequest({ ...defaults, ...opts })
}

export { createMockedRequest }
