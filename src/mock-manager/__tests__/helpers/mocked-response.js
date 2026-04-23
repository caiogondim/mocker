import MockedResponse from '../../mocked-response.js'
import { HTTP_STATUS_CODE } from '../../../shared/http-status-code/index.js'

function createMockedResponse(opts = {}) {
  const defaults = {
    statusCode: HTTP_STATUS_CODE.OK,
    url: 'http://example.com',
  }

  return new MockedResponse({ ...defaults, ...opts })
}

export { createMockedResponse }
