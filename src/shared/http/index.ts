import type { Readable } from 'node:stream'
import type { Headers } from './types.js'

export type { Headers } from './types.js'

import type {
  HttpIncomingMessage,
  HttpServerResponse,
  Result,
} from '../types.js'

// `getHeaders` accepts both real HTTP messages and the mock-manager's
// MockedRequest/MockedResponse. It narrows structurally via `in` checks, so we
// model only the relevant surface (a `Readable` carrying a `headers` property)
// rather than importing the concrete classes — keeping this module decoupled
// from mock-manager and avoiding a circular import.
type MockedRequest = Readable & { headers: Headers }
type MockedResponse = Readable & { headers: Headers }

import { buffer as streamBuffer } from 'node:stream/consumers'
import getConstructorName from '../get-constructor-name/index.js'
import {
  redactHeaders,
  SecretNotFoundError,
  unredactHeaders,
} from './redact-headers/index.js'
import createRequest from './request/index.js'

async function getBody(req: Readable): Promise<Buffer> {
  return streamBuffer(req)
}

function getHeaders(
  reqOrRes:
    | HttpIncomingMessage
    | MockedRequest
    | HttpServerResponse
    | MockedResponse,
): Headers {
  let raw: Record<string, unknown> = {}

  if ('headers' in reqOrRes) {
    raw = structuredClone(reqOrRes.headers) as Record<string, unknown>
  } else if (
    'getHeaders' in reqOrRes &&
    typeof reqOrRes.getHeaders === 'function'
  ) {
    raw = structuredClone(reqOrRes.getHeaders()) as Record<string, unknown>
  }

  const headers: Headers = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) {
      headers[key] = value as string | string[] | number | null
    }
  }

  return headers
}

function isHeaders(value: unknown): value is Headers {
  // Must be an object at the root level
  if (getConstructorName(value) !== 'Object') {
    return false
  }

  for (const headerValue of Object.values(value as object)) {
    const valueConstructorName = getConstructorName(headerValue)
    if (
      ['String', 'Number', 'Undefined', 'Null'].includes(valueConstructorName)
    ) {
      continue
    }

    // `Array.isArray` To make TypeScript happy
    if (valueConstructorName !== 'Array' || !Array.isArray(headerValue)) {
      return false
    }

    // In case a value is an Array, all values inside it must be a string
    if (
      headerValue.every((arrValue) => getConstructorName(arrValue) === 'String')
    ) {
      continue
    }

    return false
  }

  return true
}

function parseHeaders(value: unknown): Result<Headers> {
  if (!isHeaders(value)) {
    return {
      ok: false,
      error: new TypeError('Expected a valid Headers object'),
    }
  }
  return { ok: true, value }
}

/**
 * RFC 9110 §7.6.1 — hop-by-hop headers that MUST NOT be forwarded by
 * an intermediary.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Removes hop-by-hop headers from a headers object.
 * Also removes any headers listed in the Connection header value
 * (RFC 9110 §7.6.1).
 */
function stripHopByHopHeaders(headers: Headers): Headers {
  const output: Headers = {}

  // Parse Connection header to find additional headers to strip
  const connectionValue = headers.connection
  const connectionTokens: Set<string> = new Set()
  if (typeof connectionValue === 'string') {
    for (const token of connectionValue.split(',')) {
      const trimmed = token.trim().toLowerCase()
      if (trimmed) {
        connectionTokens.add(trimmed)
      }
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lowerKey) || connectionTokens.has(lowerKey)) {
      continue
    }
    output[key] = value
  }

  return output
}

export {
  createRequest,
  getBody,
  getHeaders,
  isHeaders,
  parseHeaders,
  redactHeaders,
  SecretNotFoundError,
  stripHopByHopHeaders,
  unredactHeaders,
}
