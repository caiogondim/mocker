import { PassThrough } from 'node:stream'
import type { Headers } from '../shared/http/types.js'
import type { ConnectionId, HttpStatusCode } from '../shared/types.js'

class MockedResponse extends PassThrough {
  readonly statusCode: HttpStatusCode
  readonly headers: Headers
  readonly url: string
  readonly connectionId: ConnectionId

  constructor({
    statusCode,
    headers = {},
    url,
    connectionId = '?' as ConnectionId,
  }: {
    statusCode: HttpStatusCode
    headers?: Headers
    url: string
    connectionId?: ConnectionId
  }) {
    super()

    this.statusCode = statusCode

    this.headers = headers

    this.url = url

    this.connectionId = connectionId
  }
}

export default MockedResponse
