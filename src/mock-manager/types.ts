import type { Headers } from '../shared/http/index.js'
import type { HttpMethod, HttpStatusCode, Json } from '../shared/types.js'

export type MockFile = {
  request: {
    url: string
    method: HttpMethod
    headers: Headers
    body: string | Json
  }
  response: {
    statusCode: HttpStatusCode
    headers: Headers
    body: string | Json
  }
}

export type RequestFile = {
  file: string
  request: {
    url: string
    method: HttpMethod
    headers: Headers
    body: string | Json
  }
}
