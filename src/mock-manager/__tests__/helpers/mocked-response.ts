import type { Headers } from '../../../shared/http/types.js'
import { HTTP_STATUS_CODE } from '../../../shared/http-status-code/index.js'
import type { ConnectionId, HttpStatusCode } from '../../../shared/types.js'
import MockedResponse from '../../mocked-response.js'

function createMockedResponse(
  opts: {
    statusCode?: HttpStatusCode
    headers?: Headers
    url?: string
    connectionId?: ConnectionId
  } = {},
) {
  const defaults = {
    statusCode: HTTP_STATUS_CODE.OK,
    url: 'http://example.com',
  }

  return new MockedResponse({ ...defaults, ...opts })
}

export { createMockedResponse }
